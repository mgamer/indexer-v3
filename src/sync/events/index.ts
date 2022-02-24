import { AddressZero, HashZero } from "@ethersproject/constants";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { EventDataKind, getEventData } from "@/events-sync/data";
import * as es from "@/events-sync/storage";
import { parseEvent } from "@/events-sync/parser";

import * as eventsSync from "@/jobs/events-sync/index";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

// TODO: All event tables have as primary key (blockHash, txHash, logIndex).
// While this is the correct way to do it in order to protect against chain
// reorgs we might as well do without the block hash (since the exact block
// at which an event occured is less important for us than the fact that it
// did occur). Removing the block hash from the primary key will definitely
// result in a write/update speed up. We already have an example of the new
// design in the `fill_events_2` table - ideally we should port every event
// table to it.

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
      const cancelEvents: es.cancels.Event[] = [];
      const fillEvents: es.fills.Event[] = [];

      for (const log of logs) {
        try {
          const baseEventParams = parseEvent(log, blockRange);

          if (!options?.backfill) {
            blockHashToNumber[baseEventParams.blockHash] =
              baseEventParams.block;
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
                timestamp: baseEventParams.timestamp,
                maker: from,
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-sell-balance`,
                timestamp: baseEventParams.timestamp,
                maker: to,
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
                });
              }

              break;
            }

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
                timestamp: baseEventParams.timestamp,
                maker: from,
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-sell-balance`,
                timestamp: baseEventParams.timestamp,
                maker: to,
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
                // TODO: This is not going to work since the events are uniquely
                // identified by their on-chain event identifier (which consists
                // of the tuple (block_hash, tx_hash, tx_index)). Any duplicated
                // events are simply ignored and here we created a duplicate one
                // for each item in the batch. We should add a new column to the
                // primary key to account for this (maybe also address the above
                // todo item and remove the block hash from the primary key). As
                // for the new fills table we should integrate batch_index.
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
                  timestamp: baseEventParams.timestamp,
                  maker: from,
                  data: {
                    kind: "sell-balance",
                    contract: baseEventParams.address,
                    tokenId: tokenIds[i],
                  },
                });
                makerInfos.push({
                  context: `${contextPrefix}-${to}-sell-balance`,
                  timestamp: baseEventParams.timestamp,
                  maker: to,
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
                  });
                }
              }

              break;
            }

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
                timestamp: baseEventParams.timestamp,
                maker: owner,
                data: {
                  kind: "sell-approval",
                  contract: baseEventParams.address,
                  operator,
                  approved,
                },
              });

              break;
            }

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
                timestamp: baseEventParams.timestamp,
                maker: from,
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-buy-balance`,
                timestamp: baseEventParams.timestamp,
                maker: to,
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });

              break;
            }

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
                timestamp: baseEventParams.timestamp,
                maker: to,
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
                timestamp: baseEventParams.timestamp,
                maker: from,
                data: {
                  kind: "buy-balance",
                  contract: baseEventParams.address,
                },
              });

              break;
            }

            case "wyvern-v2-order-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["hash"].toLowerCase();

              cancelEvents.push({
                orderKind: "wyvern-v2",
                orderId,
                baseEventParams,
              });

              orderInfos.push({
                context: `cancelled-${orderId}`,
                id: orderId,
              });

              break;
            }

            case "wyvern-v2-orders-matched": {
              const parsedLog = eventData.abi.parseLog(log);
              const buyOrderId = parsedLog.args["buyHash"].toLowerCase();
              const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              // Since WyvernV2 fill events don't include the traded token, we
              // have to deduce it from the nft transfer event occured exactly
              // before the fill event. The code below assumes that events are
              // retrieved in chronological orders from the blockchain.
              let associatedNftTransferEvent: es.nftTransfers.Event | undefined;
              if (nftTransferEvents.length) {
                // Ensure the last nft transfer event was part of the fill
                const event = nftTransferEvents[nftTransferEvents.length - 1];
                if (
                  event.baseEventParams.txHash === baseEventParams.txHash &&
                  event.baseEventParams.logIndex ===
                    baseEventParams.logIndex - 1 &&
                  // Only single token fills are supported and recognized
                  event.baseEventParams.batchIndex === 1
                ) {
                  associatedNftTransferEvent = event;
                }
              }

              if (!associatedNftTransferEvent) {
                // Skip if we can't associated to an nft transfer event
                break;
              }

              let batchIndex = 1;
              if (buyOrderId !== HashZero) {
                fillEvents.push({
                  orderKind: "wyvern-v2",
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
                  orderKind: "wyvern-v2",
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
              });

              break;
            }

            case "wyvern-v2.3-orders-matched": {
              const parsedLog = eventData.abi.parseLog(log);
              const buyOrderId = parsedLog.args["buyHash"].toLowerCase();
              const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
              const maker = parsedLog.args["maker"].toLowerCase();
              const taker = parsedLog.args["taker"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              // Since WyvernV2 fill events don't include the traded token, we
              // have to deduce it from the nft transfer event occured exactly
              // before the fill event. The code below assumes that events are
              // retrieved in chronological orders from the blockchain.
              let associatedNftTransferEvent: es.nftTransfers.Event | undefined;
              if (nftTransferEvents.length) {
                // Ensure the last nft transfer event was part of the fill
                const event = nftTransferEvents[nftTransferEvents.length - 1];
                if (
                  event.baseEventParams.txHash === baseEventParams.txHash &&
                  event.baseEventParams.logIndex ===
                    baseEventParams.logIndex - 1 &&
                  // Only single token fills are supported and recognized
                  event.baseEventParams.batchIndex === 1
                ) {
                  associatedNftTransferEvent = event;
                }
              }

              if (!associatedNftTransferEvent) {
                // Skip if we can't associated to an nft transfer event
                break;
              }

              let batchIndex = 1;
              if (buyOrderId !== HashZero) {
                fillEvents.push({
                  orderKind: "wyvern-v2.3",
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
                  orderKind: "wyvern-v2.3",
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
            }
          }
        } catch (error) {
          logger.info("sync-events", `Failed to handle events: ${error}`);
          throw error;
        }
      }

      await Promise.all([
        es.bulkCancels.addEvents(bulkCancelEvents, backfill),
        es.cancels.addEvents(cancelEvents),
        es.fills.addEvents(fillEvents),
        es.ftTransfers.addEvents(ftTransferEvents, backfill),
        es.nftApprovals.addEvents(nftApprovalEvents),
        es.nftTransfers.addEvents(nftTransferEvents, backfill),
      ]);

      if (!backfill) {
        await Promise.all([
          fillUpdates.addToQueue(fillInfos),
          orderUpdatesById.addToQueue(orderInfos),
          orderUpdatesByMaker.addToQueue(makerInfos),
          tokenUpdatesMint.addToQueue(mintInfos),
        ]);

        // When not backfilling, save all retrieved blocks in order
        // to efficiently check and handle block reorgs.
        await eventsSync.saveLatestBlocks(
          Object.entries(blockHashToNumber).map(([hash, block]) => ({
            hash,
            block,
          }))
        );
      }
    });
};

export const unsyncEvents = async (blockHash: string) =>
  Promise.all([
    es.bulkCancels.removeEvents(blockHash),
    es.cancels.removeEvents(blockHash),
    es.fills.removeEvents(blockHash),
    es.ftTransfers.removeEvents(blockHash),
    es.nftApprovals.removeEvents(blockHash),
    es.nftTransfers.removeEvents(blockHash),
  ]);
