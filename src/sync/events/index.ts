import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Common } from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  TransferEvent,
  addTransferEvents,
} from "@/events-sync/common/transfer-events";
import { parseEvent } from "@/events-sync/parser";

type EventKind =
  | "erc20-transfer"
  | "erc721-transfer"
  | "erc1155-transfer-single"
  | "erc1155-transfer-batch"
  | "weth-deposit"
  | "weth-withdrawal";

type EventData = {
  kind: EventKind;
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

const allEventData = [
  erc20Transfer,
  erc721Transfer,
  erc1155TransferSingle,
  erc1155TransferBatch,
  wethDeposit,
  wethWithdrawal,
];

export const syncEvents = async (fromBlock: number, toBlock: number) =>
  baseProvider
    .getLogs({
      topics: [
        [
          erc20Transfer.topic,
          // erc721Transfer.topic === erc20Transfer.topic
          erc1155TransferSingle.topic,
          erc1155TransferBatch.topic,
          wethDeposit.topic,
          wethWithdrawal.topic,
        ],
      ],
      fromBlock,
      toBlock,
    })
    .then(async (logs) => {
      const transferEvents: TransferEvent[] = [];

      for (const log of logs) {
        try {
          // Parse common event params
          const baseEventParams = parseEvent(log);

          // Find first matching event
          const eventData = allEventData.find(
            ({ addresses, topic, numTopics }) =>
              log.topics[0] === topic &&
              log.topics.length === numTopics &&
              (addresses ? addresses[log.address.toLowerCase()] : true)
          );

          switch (eventData?.kind) {
            case "erc20-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = Buffer.from(parsedLog.args["from"].slice(2), "hex");
              const to = Buffer.from(parsedLog.args["to"].slice(2), "hex");
              const amount = parsedLog.args["amount"].toString();

              transferEvents.push({
                kind: "erc20",
                from,
                to,
                tokenId: "-1",
                amount,
                baseEventParams,
              });

              break;
            }

            case "erc721-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = Buffer.from(parsedLog.args["from"].slice(2), "hex");
              const to = Buffer.from(parsedLog.args["to"].slice(2), "hex");
              const tokenId = parsedLog.args["tokenId"].toString();

              transferEvents.push({
                kind: "erc721",
                from,
                to,
                tokenId,
                amount: "1",
                baseEventParams,
              });

              break;
            }

            case "erc1155-transfer-single": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = Buffer.from(parsedLog.args["from"].slice(2), "hex");
              const to = Buffer.from(parsedLog.args["to"].slice(2), "hex");
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              transferEvents.push({
                kind: "erc1155",
                from,
                to,
                tokenId,
                amount,
                baseEventParams,
              });

              break;
            }

            case "erc1155-transfer-batch": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = Buffer.from(parsedLog.args["from"].slice(2), "hex");
              const to = Buffer.from(parsedLog.args["to"].slice(2), "hex");
              const tokenIds = parsedLog.args["tokenIds"].map(String);
              const amounts = parsedLog.args["amounts"].map(String);

              const count = Math.min(tokenIds.length, amounts.length);
              for (let i = 0; i < count; i++) {
                transferEvents.push({
                  kind: "erc1155",
                  from,
                  to,
                  tokenId: tokenIds[i],
                  amount: amounts[i],
                  baseEventParams,
                });
              }

              break;
            }

            case "weth-deposit": {
              const parsedLog = eventData.abi.parseLog(log);
              const to = Buffer.from(parsedLog.args["to"].slice(2), "hex");
              const amount = parsedLog.args["amount"].toString();

              transferEvents.push({
                kind: "erc20",
                from: Buffer.from(AddressZero.slice(2), "hex"),
                to,
                tokenId: "-1",
                amount,
                baseEventParams,
              });

              break;
            }

            case "weth-withdrawal": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = Buffer.from(parsedLog.args["from"].slice(2), "hex");
              const amount = parsedLog.args["amount"].toString();

              transferEvents.push({
                kind: "erc20",
                from,
                to: Buffer.from(AddressZero.slice(2), "hex"),
                tokenId: "-1",
                amount,
                baseEventParams,
              });

              break;
            }
          }
        } catch (error) {
          logger.info("sync_events", `Failed to handle events: ${error}`);
          throw error;
        }
      }

      await addTransferEvents(transferEvents);
    });
