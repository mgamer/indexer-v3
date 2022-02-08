import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Common, WyvernV2 } from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as cancels from "@/events-sync/common/cancel-events";
import * as fills from "@/events-sync/common/fill-events";
import * as ftTransfers from "@/events-sync/common/ft-transfer-events";
import * as nftTransfers from "@/events-sync/common/nft-transfer-events";
import { parseEvent } from "@/events-sync/parser";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";

// TODO: All event tables have as primary key (blockHash, txHash, logIndex).
// While this is the correct way to do it in order to protect against chain
// reorgs we might as well do without the block hash (since the exact block
// at which an event occured is less important for us than the fact that it
// did occur). Removing the block hash from the primary key will definitely
// result in a write/update speed up. Something to research.

// TODO: Split into multiple modules

type EventDataKind =
  | "erc20-transfer"
  | "erc721-transfer"
  | "erc1155-transfer-single"
  | "erc1155-transfer-batch"
  | "weth-deposit"
  | "weth-withdrawal"
  | "wyvern-v2-orders-matched"
  | "wyvern-v2-order-cancelled";

type EventData = {
  kind: EventDataKind;
  addresses?: { [address: string]: boolean };
  topic: string;
  numTopics: number;
  abi: Interface;
};

// New events to get synced should be added below

const erc20Transfer: EventData = {
  kind: "erc20-transfer",
  addresses: { [Common.Addresses.Weth[config.chainId]]: true },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 amount
    )`,
  ]),
};

const erc721Transfer: EventData = {
  kind: "erc721-transfer",
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 4,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 indexed tokenId
    )`,
  ]),
};

const erc1155TransferSingle: EventData = {
  kind: "erc1155-transfer-single",
  topic: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
  numTopics: 4,
  abi: new Interface([
    `event TransferSingle(
      address indexed operator,
      address indexed from,
      address indexed to,
      uint256 tokenId,
      uint256 amount
    )`,
  ]),
};

const erc1155TransferBatch: EventData = {
  kind: "erc1155-transfer-batch",
  topic: "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb",
  numTopics: 4,
  abi: new Interface([
    `event TransferBatch(
      address indexed operator,
      address indexed from,
      address indexed to,
      uint256[] tokenIds,
      uint256[] amounts
    )`,
  ]),
};

const wethDeposit: EventData = {
  kind: "weth-deposit",
  addresses: { [Common.Addresses.Weth[config.chainId]]: true },
  topic: "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
  numTopics: 2,
  abi: new Interface([
    `event Deposit(
      address indexed to,
      uint256 amount
    )`,
  ]),
};

const wethWithdrawal: EventData = {
  kind: "weth-withdrawal",
  addresses: { [Common.Addresses.Weth[config.chainId]]: true },
  topic: "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",
  numTopics: 2,
  abi: new Interface([
    `event Withdrawal(
      address indexed from,
      uint256 amount
    )`,
  ]),
};

const wyvernV2OrderCancelled: EventData = {
  kind: "wyvern-v2-order-cancelled",
  addresses: { [WyvernV2.Addresses.Exchange[config.chainId]]: true },
  topic: "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",
  numTopics: 2,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 indexed hash
    )`,
  ]),
};

const wyvernV2OrdersMatched: EventData = {
  kind: "wyvern-v2-orders-matched",
  addresses: { [WyvernV2.Addresses.Exchange[config.chainId]]: true },
  topic: "0xc4109843e0b7d514e4c093114b863f8e7d8d9a458c372cd51bfe526b588006c9",
  numTopics: 4,
  abi: new Interface([
    `event OrdersMatched(
      bytes32 buyHash,
      bytes32 sellHash,
      address indexed maker,
      address indexed taker,
      uint256 price,
      bytes32 indexed metadata
    )`,
  ]),
};

const allEventData = [
  erc20Transfer,
  erc721Transfer,
  erc1155TransferSingle,
  erc1155TransferBatch,
  wethDeposit,
  wethWithdrawal,
  wyvernV2OrderCancelled,
  wyvernV2OrdersMatched,
];

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  backfill = false
) => {
  // Fetch the timestamp of the blocks at each side of the range
  const [fromBlockTimestamp, toBlockTimestamp] = await Promise.all([
    baseProvider.getBlock(fromBlock),
    baseProvider.getBlock(toBlock),
  ]).then((blocks) => [blocks[0].timestamp, blocks[1].timestamp]);

  const blockRange = {
    from: {
      block: fromBlock,
      timestamp: fromBlockTimestamp,
    },
    to: {
      block: toBlock,
      timestamp: toBlockTimestamp,
    },
  };

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  await baseProvider
    .getLogs({
      topics: [
        [
          erc20Transfer.topic,
          // erc721Transfer.topic === erc20Transfer.topic
          erc1155TransferSingle.topic,
          erc1155TransferBatch.topic,
          wethDeposit.topic,
          wethWithdrawal.topic,
          wyvernV2OrderCancelled.topic,
          wyvernV2OrdersMatched.topic,
        ],
      ],
      fromBlock,
      toBlock,
    })
    .then(async (logs) => {
      const cancelEvents: cancels.Event[] = [];
      const fillEvents: fills.Event[] = [];
      const ftTransferEvents: ftTransfers.Event[] = [];
      const nftTransferEvents: nftTransfers.Event[] = [];

      for (const log of logs) {
        try {
          // Parse common event params
          const baseEventParams = parseEvent(log, blockRange);

          // Find first matching event
          const eventData = allEventData.find(
            ({ addresses, topic, numTopics }) =>
              log.topics[0] === topic &&
              log.topics.length === numTopics &&
              (addresses ? addresses[log.address.toLowerCase()] : true)
          );

          const context =
            fromBuffer(baseEventParams.txHash) +
            "-" +
            baseEventParams.logIndex.toString();

          switch (eventData?.kind) {
            case "erc20-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = toBuffer(parsedLog.args["from"]);
              const to = toBuffer(parsedLog.args["to"]);
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from,
                to,
                amount,
                baseEventParams,
              });

              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "buy",
                maker: from,
                contract: baseEventParams.address,
              });
              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "buy",
                maker: to,
                contract: baseEventParams.address,
              });

              break;
            }

            case "erc721-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = toBuffer(parsedLog.args["from"]);
              const to = toBuffer(parsedLog.args["to"]);
              const tokenId = parsedLog.args["tokenId"].toString();

              nftTransferEvents.push({
                kind: "erc721",
                from,
                to,
                tokenId,
                amount: "1",
                baseEventParams,
              });

              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "sell",
                maker: from,
                contract: baseEventParams.address,
                tokenId,
              });
              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "sell",
                maker: to,
                contract: baseEventParams.address,
                tokenId,
              });

              break;
            }

            case "erc1155-transfer-single": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = toBuffer(parsedLog.args["from"]);
              const to = toBuffer(parsedLog.args["to"]);
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              nftTransferEvents.push({
                kind: "erc1155",
                from,
                to,
                tokenId,
                amount,
                baseEventParams,
              });

              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "sell",
                maker: from,
                contract: baseEventParams.address,
                tokenId,
              });
              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "sell",
                maker: to,
                contract: baseEventParams.address,
                tokenId,
              });

              break;
            }

            case "erc1155-transfer-batch": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = toBuffer(parsedLog.args["from"]);
              const to = toBuffer(parsedLog.args["to"]);
              const tokenIds = parsedLog.args["tokenIds"].map(String);
              const amounts = parsedLog.args["amounts"].map(String);

              const count = Math.min(tokenIds.length, amounts.length);
              for (let i = 0; i < count; i++) {
                nftTransferEvents.push({
                  kind: "erc1155",
                  from,
                  to,
                  tokenId: tokenIds[i],
                  amount: amounts[i],
                  baseEventParams,
                });

                makerInfos.push({
                  context,
                  timestamp: baseEventParams.timestamp,
                  side: "sell",
                  maker: from,
                  contract: baseEventParams.address,
                  tokenId: tokenIds[i],
                });
                makerInfos.push({
                  context,
                  timestamp: baseEventParams.timestamp,
                  side: "sell",
                  maker: to,
                  contract: baseEventParams.address,
                  tokenId: tokenIds[i],
                });
              }

              break;
            }

            case "weth-deposit": {
              const parsedLog = eventData.abi.parseLog(log);
              const to = toBuffer(parsedLog.args["to"]);
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from: toBuffer(AddressZero),
                to,
                amount,
                baseEventParams,
              });

              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "buy",
                maker: to,
                contract: baseEventParams.address,
              });

              break;
            }

            case "weth-withdrawal": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = toBuffer(parsedLog.args["from"]);
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from,
                to: toBuffer(AddressZero),
                amount,
                baseEventParams,
              });

              makerInfos.push({
                context,
                timestamp: baseEventParams.timestamp,
                side: "buy",
                maker: from,
                contract: baseEventParams.address,
              });

              break;
            }

            case "wyvern-v2-order-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["hash"].toLowerCase();

              cancelEvents.push({
                orderId,
                baseEventParams,
              });

              orderInfos.push({
                context,
                id: orderId,
              });

              break;
            }

            case "wyvern-v2-orders-matched": {
              const parsedLog = eventData.abi.parseLog(log);
              const buyOrderId = parsedLog.args["buyHash"].toLowerCase();
              const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
              const maker = toBuffer(parsedLog.args["maker"]);
              const taker = toBuffer(parsedLog.args["taker"]);
              const price = parsedLog.args["price"].toString();

              fillEvents.push({
                buyOrderId,
                sellOrderId,
                maker,
                taker,
                price,
                baseEventParams,
              });

              fillInfos.push({
                context,
                buyOrderId,
                sellOrderId,
                timestamp: baseEventParams.timestamp,
              });

              orderInfos.push({
                context,
                id: buyOrderId,
              });
              orderInfos.push({
                context,
                id: sellOrderId,
              });

              break;
            }
          }
        } catch (error) {
          logger.info("sync-events", `Failed to handle events: ${error}`);
          throw error;
        }
      }

      await Promise.all([
        cancels.addEvents(cancelEvents),
        fills.addEvents(fillEvents),
        ftTransfers.addEvents(ftTransferEvents, backfill),
        nftTransfers.addEvents(nftTransferEvents, backfill),
      ]);

      if (!backfill) {
        await Promise.all([
          fillUpdates.addToQueue(fillInfos),
          orderUpdatesById.addToQueue(orderInfos),
          orderUpdatesByMaker.addToQueue(makerInfos),
        ]);
      }
    });
};

export const unsyncEvents = async (blockHash: Buffer) =>
  Promise.all([
    cancels.removeEvents(blockHash),
    fills.removeEvents(blockHash),
    ftTransfers.removeEvents(blockHash),
    nftTransfers.removeEvents(blockHash),
  ]);
