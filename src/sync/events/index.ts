import { Log } from "@ethersproject/abstract-provider";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { EventDataKind, getEventData } from "@/events-sync/data";
import * as es from "@/events-sync/storage";
import { parseEvent } from "@/events-sync/parser";
import * as eventsSync from "@/jobs/events-sync/index";
import * as blockCheck from "@/jobs/events-sync/block-check-queue";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import { OrderKind } from "@/orderbook/orders";
import * as Foundation from "@/orderbook/orders/foundation";

// TODO: Split into multiple files (by exchange).
// TODO: For simplicity, don't use bulk inserts/upserts for realtime
// processing (this will make things so much more flexible). However
// for backfill procesing, we should still use bulk operations so as
// to be performant enough. This might imply separate code to handle
// backfill vs realtime events.

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    backfill?: boolean;
    eventDataKinds?: EventDataKind[];
  }
) => {
  // Fetch the timestamps of the blocks at each side of the range in
  // order to be able to estimate the timestamp of each block within
  // the range (to avoid any further `eth_getBlockByNumber` calls).

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
  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  const blockHashToNumber: { [hash: string]: number } = {};

  const backfill = Boolean(options?.backfill);
  const eventDatas = getEventData(options?.eventDataKinds);

  await baseProvider
    .getLogs({
      // Only keep unique topics (eg. an example of duplicated topics are
      // erc721 and erc20 transfers which have the exact same signature).
      topics: [[...new Set(eventDatas.map(({ topic }) => topic))]],
      fromBlock,
      toBlock,
    })
    .then(async (logs) => {
      const ftTransferEvents: es.ftTransfers.Event[] = [];
      const nftApprovalEvents: es.nftApprovals.Event[] = [];
      const nftTransferEvents: es.nftTransfers.Event[] = [];
      const bulkCancelEvents: es.bulkCancels.Event[] = [];
      const nonceCancelEvents: es.nonceCancels.Event[] = [];
      const cancelEvents: es.cancels.Event[] = [];
      const cancelEventsFoundation: es.cancels.Event[] = [];
      const fillEvents: es.fills.Event[] = [];
      const fillEventsZeroExV4: es.fills.Event[] = [];
      const fillEventsFoundation: es.fills.Event[] = [];
      const foundationOrders: Foundation.OrderInfo[] = [];

      // Keep track of all events within the currently processing transaction
      let currentTx: string | undefined;
      let currentTxEvents: {
        log: Log;
        address: string;
        logIndex: number;
      }[] = [];

      for (const log of logs) {
        try {
          const baseEventParams = parseEvent(log, blockRange);

          // Save the event in the currently processing transaction data
          if (currentTx !== baseEventParams.txHash) {
            currentTx = baseEventParams.txHash;
            currentTxEvents = [];
          }
          currentTxEvents.push({
            log,
            address: baseEventParams.address,
            logIndex: baseEventParams.logIndex,
          });

          if (!options?.backfill) {
            // Save the block (and its hash) in order to detect orphans
            blockHashToNumber[baseEventParams.blockHash] = baseEventParams.block;
          }

          // Find first matching event:
          // - matching topic
          // - matching number of topics (eg. indexed fields)
          // - matching addresses
          const eventData = eventDatas.find(
            ({ addresses, topic, numTopics }) =>
              log.topics[0] === topic &&
              log.topics.length === numTopics &&
              (addresses ? addresses[log.address.toLowerCase()] : true)
          );

          switch (eventData?.kind) {
            // Erc721

            case "erc721-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = parsedLog.args["from"].toLowerCase();
              const to = parsedLog.args["to"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();

              nftTransferEvents.push({
                kind: "erc721",
                from,
                to,
                tokenId,
                amount: "1",
                baseEventParams,
              });

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

              makerInfos.push({
                context: `${contextPrefix}-${from}-sell-balance`,
                maker: from,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-sell-balance`,
                maker: to,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });

              if (from === AddressZero) {
                mintInfos.push({
                  contract: baseEventParams.address,
                  tokenId,
                  mintedTimestamp: baseEventParams.timestamp,
                });
              }

              break;
            }

            // Erc1155

            case "erc1155-transfer-single": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = parsedLog.args["from"].toLowerCase();
              const to = parsedLog.args["to"].toLowerCase();
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

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

              makerInfos.push({
                context: `${contextPrefix}-${from}-sell-balance`,
                maker: from,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-sell-balance`,
                maker: to,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });

              if (from === AddressZero) {
                mintInfos.push({
                  contract: baseEventParams.address,
                  tokenId,
                  mintedTimestamp: baseEventParams.timestamp,
                });
              }

              break;
            }

            case "erc1155-transfer-batch": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = parsedLog.args["from"].toLowerCase();
              const to = parsedLog.args["to"].toLowerCase();
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
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: i + 1,
                  },
                });

                // Make sure to only handle the same data once per transaction
                const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenIds[i]}`;

                makerInfos.push({
                  context: `${contextPrefix}-${from}-sell-balance`,
                  maker: from,
                  trigger: {
                    kind: "balance-change",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                  data: {
                    kind: "sell-balance",
                    contract: baseEventParams.address,
                    tokenId: tokenIds[i],
                  },
                });
                makerInfos.push({
                  context: `${contextPrefix}-${to}-sell-balance`,
                  maker: to,
                  trigger: {
                    kind: "balance-change",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                  data: {
                    kind: "sell-balance",
                    contract: baseEventParams.address,
                    tokenId: tokenIds[i],
                  },
                });

                if (from === AddressZero) {
                  mintInfos.push({
                    contract: baseEventParams.address,
                    tokenId: tokenIds[i],
                    mintedTimestamp: baseEventParams.timestamp,
                  });
                }
              }

              break;
            }

            // Erc721/Erc1155 common

            case "erc721/1155-approval-for-all": {
              const parsedLog = eventData.abi.parseLog(log);
              const owner = parsedLog.args["owner"].toLowerCase();
              const operator = parsedLog.args["operator"].toLowerCase();
              const approved = parsedLog.args["approved"];

              nftApprovalEvents.push({
                owner,
                operator,
                approved,
                baseEventParams,
              });

              // Make sure to only handle the same data once per on-chain event
              // (instead of once per transaction as we do with balance updates
              // since we're handling nft approvals differently - checking them
              // individually).
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${baseEventParams.logIndex}`;

              makerInfos.push({
                context: `${contextPrefix}-${owner}-sell-approval`,
                maker: owner,
                trigger: {
                  kind: "approval-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-approval",
                  contract: baseEventParams.address,
                  operator,
                  approved,
                },
              });

              break;
            }

            // Erc20

            case "erc20-transfer": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = parsedLog.args["from"].toLowerCase();
              const to = parsedLog.args["to"].toLowerCase();
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from,
                to,
                amount,
                baseEventParams,
              });

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

              makerInfos.push({
                context: `${contextPrefix}-${from}-buy-balance`,
                maker: from,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-buy-balance`,
                maker: to,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });

              break;
            }

            // Weth

            case "weth-deposit": {
              const parsedLog = eventData.abi.parseLog(log);
              const to = parsedLog.args["to"].toLowerCase();
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from: AddressZero,
                to,
                amount,
                baseEventParams,
              });

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

              makerInfos.push({
                context: `${contextPrefix}-${to}-buy-balance`,
                maker: to,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });

              break;
            }

            case "weth-withdrawal": {
              const parsedLog = eventData.abi.parseLog(log);
              const from = parsedLog.args["from"].toLowerCase();
              const amount = parsedLog.args["amount"].toString();

              ftTransferEvents.push({
                from,
                to: AddressZero,
                amount,
                baseEventParams,
              });

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

              makerInfos.push({
                context: `${contextPrefix}-${from}-buy-balance`,
                maker: from,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });

              break;
            }

            // Foundation

            case "foundation-buy-price-set": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const maker = parsedLog.args["seller"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              foundationOrders.push({
                orderParams: {
                  contract,
                  tokenId,
                  maker,
                  price,
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                metadata: {
                  source: "Foundation",
                },
              });

              break;
            }

            case "foundation-buy-price-accepted": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const maker = parsedLog.args["seller"].toLowerCase();
              const taker = parsedLog.args["buyer"].toLowerCase();
              const protocolFee = parsedLog.args["protocolFee"].toString();

              const orderId = keccak256(["address", "uint256"], [contract, tokenId]);

              // Custom handling to support on-chain orderbook quirks.
              fillEventsFoundation.push({
                orderKind: "foundation",
                orderId,
                orderSide: "sell",
                maker,
                taker,
                // Deduce the price from the protocol fee (which is 5%).
                price: bn(protocolFee).mul(10000).div(50).toString(),
                contract,
                tokenId,
                amount: "1",
                baseEventParams,
              });
              orderInfos.push({
                context: `filled-${orderId}-${baseEventParams.txHash}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              break;
            }

            case "foundation-buy-price-invalidated":
            case "foundation-buy-price-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();

              const orderId = keccak256(["address", "uint256"], [contract, tokenId]);

              // Custom handling to support on-chain orderbook quirks.
              cancelEventsFoundation.push({
                orderKind: "foundation",
                orderId,
                baseEventParams,
              });
              orderInfos.push({
                context: `cancelled-${orderId}-${baseEventParams.txHash}`,
                id: orderId,
                trigger: {
                  kind: "cancel",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              break;
            }

            // LooksRare

            case "looks-rare-cancel-all-orders": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["user"].toLowerCase();
              const newMinNonce = parsedLog.args["newMinNonce"].toString();

              bulkCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                minNonce: newMinNonce,
                baseEventParams,
              });

              break;
            }

            case "looks-rare-cancel-multiple-orders": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["user"].toLowerCase();
              const orderNonces = parsedLog.args["orderNonces"].map(String);

              let batchIndex = 1;
              for (const orderNonce of orderNonces) {
                nonceCancelEvents.push({
                  orderKind: "looks-rare",
                  maker,
                  nonce: orderNonce,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });
              }

              break;
            }

            case "looks-rare-taker-ask": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["orderHash"].toLowerCase();
              const orderNonce = parsedLog.args["orderNonce"].toString();
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const currency = parsedLog.args["currency"].toLowerCase();
              const price = parsedLog.args["price"].toString();
              const contract = parsedLog.args["collection"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              if (![Sdk.Common.Addresses.Weth[config.chainId]].includes(currency)) {
                // Skip if the payment token is not supported
                break;
              }

              fillEvents.push({
                orderKind: "looks-rare",
                orderId,
                orderSide: "sell",
                maker,
                taker,
                price,
                contract,
                tokenId,
                amount,
                baseEventParams,
              });

              // Cancel all the other orders of the maker having the same nonce.
              nonceCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                nonce: orderNonce,
                baseEventParams,
              });

              orderInfos.push({
                context: `filled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              fillInfos.push({
                context: orderId,
                orderId: orderId,
                orderSide: "sell",
                contract,
                tokenId,
                amount,
                price,
                timestamp: baseEventParams.timestamp,
              });

              break;
            }

            case "looks-rare-taker-bid": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["orderHash"].toLowerCase();
              const orderNonce = parsedLog.args["orderNonce"].toString();
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const currency = parsedLog.args["currency"].toLowerCase();
              const price = parsedLog.args["price"].toString();
              const contract = parsedLog.args["collection"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              if (![Sdk.Common.Addresses.Weth[config.chainId]].includes(currency)) {
                // Skip if the payment token is not supported
                break;
              }

              fillEvents.push({
                orderKind: "looks-rare",
                orderId,
                orderSide: "buy",
                maker,
                taker,
                price,
                contract,
                tokenId,
                amount,
                baseEventParams,
              });

              // Cancel all the other orders of the maker having the same nonce.
              nonceCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                nonce: orderNonce,
                baseEventParams,
              });

              orderInfos.push({
                context: `filled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              fillInfos.push({
                context: orderId,
                orderId: orderId,
                orderSide: "buy",
                contract,
                tokenId,
                amount,
                price,
                timestamp: baseEventParams.timestamp,
              });

              break;
            }

            // WyvernV2/WyvernV2.3

            // Wyvern V2 is now decomissioned, but we still keep handling
            // its fill event in order to get access to historical sales.
            // This is only relevant when backfilling though.

            case "wyvern-v2-orders-matched":
            case "wyvern-v2.3-orders-matched": {
              const parsedLog = eventData.abi.parseLog(log);
              const buyOrderId = parsedLog.args["buyHash"].toLowerCase();
              const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              // The code below assumes that events are retrieved in chronological
              // order from the blockchain (this is safe to assume in most cases).

              // With Wyvern, there are two main issues:
              // - the traded token is not included in the fill event, so we have
              // to deduce it by checking the nft transfer occured exactly before
              // the fill event
              // - the payment token is not included in the fill event, and we deduce
              // it as well by checking any Erc20 transfers that occured close before
              // the fill event (and default to native Eth if cannot find any)

              // Detect the traded token
              let associatedNftTransferEvent: es.nftTransfers.Event | undefined;
              if (nftTransferEvents.length) {
                // Ensure the last nft transfer event was part of the fill
                const event = nftTransferEvents[nftTransferEvents.length - 1];
                if (
                  event.baseEventParams.txHash === baseEventParams.txHash &&
                  event.baseEventParams.logIndex === baseEventParams.logIndex - 1 &&
                  // Only single token fills are supported and recognized
                  event.baseEventParams.batchIndex === 1
                ) {
                  associatedNftTransferEvent = event;
                }
              }

              if (!associatedNftTransferEvent) {
                // Skip if we can't associate to an nft transfer event
                break;
              }

              // Detect the payment token
              let paymentToken = Sdk.Common.Addresses.Eth[config.chainId];
              for (const event of currentTxEvents.slice(0, -1).reverse()) {
                // Skip once we detect another fill in the same transaction
                // (this will happen if filling through an aggregator).
                if (event.log.topics[0] === getEventData([eventData.kind])[0].topic) {
                  break;
                }

                // If we detect an Erc20 transfer as part of the same transaction
                // then we assume it's the payment for the current sale and so we
                // only keep the sale if the payment token is Weth.
                const erc20EventData = getEventData(["erc20-transfer"])[0];
                if (
                  event.log.topics[0] === erc20EventData.topic &&
                  event.log.topics.length === erc20EventData.numTopics
                ) {
                  const parsed = erc20EventData.abi.parseLog(event.log);
                  const from = parsed.args["from"].toLowerCase();
                  const to = parsed.args["to"].toLowerCase();
                  const amount = parsed.args["amount"].toString();
                  if (
                    ((maker === from && taker === to) || (maker === to && taker === from)) &&
                    amount <= price
                  ) {
                    paymentToken = event.log.address.toLowerCase();
                    break;
                  }
                }
              }

              if (
                ![
                  Sdk.Common.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(paymentToken)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              const orderKind = eventData.kind.startsWith("wyvern-v2.3")
                ? "wyvern-v2.3"
                : "wyvern-v2";

              let batchIndex = 1;
              if (buyOrderId !== HashZero) {
                fillEvents.push({
                  orderKind,
                  orderId: buyOrderId,
                  orderSide: "buy",
                  maker,
                  taker,
                  price,
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });

                orderInfos.push({
                  context: `filled-${buyOrderId}`,
                  id: buyOrderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });

                fillInfos.push({
                  context: buyOrderId,
                  orderId: buyOrderId,
                  orderSide: "buy",
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  price,
                  timestamp: baseEventParams.timestamp,
                });
              }
              if (sellOrderId !== HashZero) {
                fillEvents.push({
                  orderKind,
                  orderId: sellOrderId,
                  orderSide: "sell",
                  maker,
                  taker,
                  price,
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });

                orderInfos.push({
                  context: `filled-${sellOrderId}`,
                  id: sellOrderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });

                fillInfos.push({
                  context: sellOrderId,
                  orderId: sellOrderId,
                  orderSide: "sell",
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  price,
                  timestamp: baseEventParams.timestamp,
                });
              }

              break;
            }

            case "wyvern-v2.3-order-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["hash"].toLowerCase();

              cancelEvents.push({
                orderKind: "wyvern-v2.3",
                orderId,
                baseEventParams,
              });

              orderInfos.push({
                context: `cancelled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "cancel",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              break;
            }

            case "wyvern-v2.3-nonce-incremented": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["maker"].toLowerCase();
              const newNonce = parsedLog.args["newNonce"].toString();

              bulkCancelEvents.push({
                orderKind: "wyvern-v2.3",
                maker,
                minNonce: newNonce,
                baseEventParams,
              });

              break;
            }

            // ZeroExV4 + OpenDao

            case "zeroex-v4-erc721-order-cancelled":
            case "zeroex-v4-erc1155-order-cancelled":
            case "opendao-erc721-order-cancelled":
            case "opendao-erc1155-order-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["maker"].toLowerCase();
              const nonce = parsedLog.args["nonce"].toString();

              nonceCancelEvents.push({
                orderKind: eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind,
                maker,
                nonce,
                baseEventParams,
              });

              break;
            }

            case "zeroex-v4-erc721-order-filled":
            case "opendao-erc721-order-filled": {
              const parsedLog = eventData.abi.parseLog(log);
              const direction = parsedLog.args["direction"];
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const nonce = parsedLog.args["nonce"].toString();
              const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
              const erc20TokenAmount = parsedLog.args["erc20TokenAmount"].toString();
              const erc721Token = parsedLog.args["erc721Token"].toLowerCase();
              const erc721TokenId = parsedLog.args["erc721TokenId"].toString();

              if (
                ![
                  Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                  Sdk.OpenDao.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(erc20Token)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
              const orderSide = direction === 0 ? "sell" : "buy";

              let orderId: string | undefined;
              if (!backfill) {
                // Since the event doesn't include the exact order which got matched
                // (it only includes the nonce, but we can potentially have multiple
                // different orders sharing the same nonce off-chain), we attempt to
                // detect the order id which got filled by checking the database for
                // orders which have the exact nonce/value/token-set combination (it
                // doesn't cover all cases, but it's good enough for now).
                await idb
                  .oneOrNone(
                    `
                      SELECT
                        orders.id
                      FROM orders
                      WHERE orders.kind = '${orderKind}'
                        AND orders.maker = $/maker/
                        AND orders.nonce = $/nonce/
                        AND orders.contract = $/contract/
                        AND orders.price = $/price/
                        AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                      LIMIT 1
                    `,
                    {
                      maker: toBuffer(maker),
                      nonce,
                      contract: toBuffer(erc721Token),
                      price: erc20TokenAmount,
                    }
                  )
                  .then((result) => {
                    if (result) {
                      orderId = result.id;
                    }
                  });
              }

              fillEvents.push({
                orderKind,
                orderId,
                orderSide,
                maker,
                taker,
                price: erc20TokenAmount,
                contract: erc721Token,
                tokenId: erc721TokenId,
                amount: "1",
                baseEventParams,
              });

              // Cancel all the other orders of the maker having the same nonce.
              nonceCancelEvents.push({
                orderKind,
                maker,
                nonce,
                baseEventParams,
              });

              if (orderId) {
                orderInfos.push({
                  context: `filled-${orderId}`,
                  id: orderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });
              }

              fillInfos.push({
                context: orderId || `${maker}-${nonce}`,
                orderId: orderId,
                orderSide,
                contract: erc721Token,
                tokenId: erc721TokenId,
                amount: "1",
                price: erc20TokenAmount,
                timestamp: baseEventParams.timestamp,
              });

              break;
            }

            case "zeroex-v4-erc1155-order-filled":
            case "opendao-erc1155-order-filled": {
              const parsedLog = eventData.abi.parseLog(log);
              const direction = parsedLog.args["direction"];
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const nonce = parsedLog.args["nonce"].toString();
              const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
              const erc20FillAmount = parsedLog.args["erc20FillAmount"].toString();
              const erc1155Token = parsedLog.args["erc1155Token"].toLowerCase();
              const erc1155TokenId = parsedLog.args["erc1155TokenId"].toString();
              const erc1155FillAmount = parsedLog.args["erc1155FillAmount"].toString();

              if (
                ![
                  Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                  Sdk.OpenDao.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(erc20Token)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
              const value = bn(erc20FillAmount).div(erc1155FillAmount).toString();

              let orderId: string | undefined;
              if (!backfill) {
                // For erc1155 orders we only allow unique maker/nonce orders.
                await idb
                  .oneOrNone(
                    `
                      SELECT
                        orders.id
                      FROM orders
                      WHERE orders.kind = '${orderKind}'
                        AND orders.maker = $/maker/
                        AND orders.nonce = $/nonce/
                        AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                      LIMIT 1
                    `,
                    {
                      maker: toBuffer(maker),
                      nonce,
                    }
                  )
                  .then((result) => {
                    if (result) {
                      orderId = result.id;
                    }
                  });
              }

              // Custom handling to support partial filling
              fillEventsZeroExV4.push({
                orderKind,
                orderId,
                orderSide: direction === 0 ? "sell" : "buy",
                maker,
                taker,
                price: erc20FillAmount,
                contract: erc1155Token,
                tokenId: erc1155TokenId,
                amount: erc1155FillAmount,
                baseEventParams,
              });

              if (orderId) {
                orderInfos.push({
                  context: `filled-${orderId}-${baseEventParams.txHash}`,
                  id: orderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });
              }

              fillInfos.push({
                context: orderId || `${maker}-${nonce}`,
                orderId: orderId,
                orderSide: direction === 0 ? "sell" : "buy",
                contract: erc1155Token,
                tokenId: erc1155TokenId,
                amount: erc1155FillAmount,
                price: value,
                timestamp: baseEventParams.timestamp,
              });

              break;
            }
          }
        } catch (error) {
          logger.info("sync-events", `Failed to handle events: ${error}`);
          throw error;
        }
      }

      // WARNING! Ordering matters (fills should come in front of cancels).
      await Promise.all([
        es.fills.addEvents(fillEvents),
        es.fills.addEventsZeroExV4(fillEventsZeroExV4),
        es.fills.addEventsFoundation(fillEventsFoundation),
      ]);

      await Promise.all([
        es.nonceCancels.addEvents(nonceCancelEvents, backfill),
        es.bulkCancels.addEvents(bulkCancelEvents, backfill),
        es.cancels.addEvents(cancelEvents),
        es.cancels.addEventsFoundation(cancelEventsFoundation),
        es.ftTransfers.addEvents(ftTransferEvents, backfill),
        es.nftApprovals.addEvents(nftApprovalEvents),
        es.nftTransfers.addEvents(nftTransferEvents, backfill),
      ]);

      if (!backfill) {
        // WARNING! It's very important to guarantee that the previous
        // events are persisted to the database before any of the jobs
        // below are executed. Otherwise, the jobs can potentially use
        // stale data which will cause inconsistencies (eg. orders can
        // have wrong statuses).
        await Promise.all([
          fillUpdates.addToQueue(fillInfos),
          orderUpdatesById.addToQueue(orderInfos),
          orderUpdatesByMaker.addToQueue(makerInfos),
          tokenUpdatesMint.addToQueue(mintInfos),
          orderbookOrders.addToQueue(
            foundationOrders.map((info) => ({ kind: "foundation", info }))
          ),
        ]);

        // When not backfilling, save all retrieved blocks in order
        // to efficiently check and handle block reorgs.
        await eventsSync.saveLatestBlocks(
          Object.entries(blockHashToNumber).map(([hash, block]) => ({
            hash,
            block,
          }))
        );

        // Put all fetched blocks on a queue for handling block reorgs.
        // Recheck each block in 30s, 60s, 5m and 10m.
        await Promise.all(
          Object.entries(blockHashToNumber).map(async ([, block]) =>
            Promise.all([
              blockCheck.addToQueue(block, 30 * 10000),
              blockCheck.addToQueue(block, 60 * 10000),
              blockCheck.addToQueue(block, 5 * 60 * 10000),
              blockCheck.addToQueue(block, 10 * 60 * 10000),
            ])
          )
        );
      }
    });
};

export const unsyncEvents = async (block: number, blockHash: string) =>
  Promise.all([
    es.fills.removeEvents(block, blockHash),
    es.bulkCancels.removeEvents(block, blockHash),
    es.nonceCancels.removeEvents(block, blockHash),
    es.cancels.removeEvents(block, blockHash),
    es.ftTransfers.removeEvents(block, blockHash),
    es.nftApprovals.removeEvents(block, blockHash),
    es.nftTransfers.removeEvents(block, blockHash),
  ]);
