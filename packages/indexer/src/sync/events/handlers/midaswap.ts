import { logger } from "@/common/logger";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as midaswapUtils from "@/utils/midaswap";
import { BigNumber } from "ethers";
import * as Sdk from "@reservoir0x/sdk";
import { getSellOrderId } from "@/orderbook/orders/midaswap";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import { redb } from "@/common/db";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  logger.info("midaswap-debug", JSON.stringify(events));
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];

    switch (subKind) {
      // create pool
      case "midaswap-new-erc721-pair": {
        midaswapUtils.getPoolDetails(baseEventParams.address);
        break;
      }

      case "midaswap-erc721-deposit": {
        const parsedLog = eventData.abi.parseLog(log);
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;
        const nftIds = parsedLog.args["_NFTIDs"] as BigNumber[];
        const binLower = parsedLog.args["binLower"] as number;
        const binStep = parsedLog.args["binStep"] as number;

        nftIds.forEach((nftId: BigNumber) => {
          onChainData.orders.push({
            kind: "midaswap",
            info: {
              orderParams: {
                pool: baseEventParams.address,
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
                txBlock: baseEventParams.block,
                logIndex: baseEventParams.logIndex,
                eventName: subKind,
                lpTokenId: lpTokenId.toString(),
                nftId: nftId.toString(),
                binLower: binLower,
                binstep: binStep,
                binAmount: nftIds.length,
              },
              metadata: {},
            },
          });
        });

        break;
      }

      case "midaswap-erc20-deposit": {
        const parsedLog = eventData.abi.parseLog(log);

        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;
        const binLower = parsedLog.args["binLower"] as number;
        const binStep = parsedLog.args["binStep"] as number;
        const binAmount = parsedLog.args["binAmount"] as BigNumber;

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              eventName: subKind,
              lpTokenId: lpTokenId.toString(),
              binLower: binLower,
              binstep: binStep,
              binAmount: binAmount.toNumber(),
            },
            metadata: {},
          },
        });

        break;
      }

      case "midaswap-position-burned": {
        const parsedLog = eventData.abi.parseLog(log);
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              eventName: subKind,
              lpTokenId: lpTokenId.toString(),
            },
            metadata: {},
          },
        });

        break;
      }
      case "midaswap-sell-erc721":
      case "midaswap-buy-erc721": {
        const parsedLog = eventData.abi.parseLog(log);
        const tradeBin = parsedLog.args["tradeBin"] as number;
        const tokenId = parsedLog.args["nftTokenId"] as BigNumber;
        const lpTokenId = parsedLog.args["lpTokenID"] as BigNumber;

        const pool = await midaswapUtils.getPoolDetails(baseEventParams.address);

        const isUserSell = subKind === "midaswap-sell-erc721";

        if (!pool) {
          break;
        }

        const orderKind = "midaswap";
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;
        const price = Sdk.Midaswap.Order.binToPriceFixed(tradeBin);
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);

        if (!priceData.nativePrice) {
          break;
        }

        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        let orderId = "";
        let orderResult;
        if (isUserSell) {
          orderResult = await redb.oneOrNone(
            `
                SELECT id FROM orders
                WHERE orders.kind = 'midaswap'
                AND orders.side === 'buy'
                AND orders.fillability_status = 'fillable'
                AND orders.data->>'lpTokenId' = $/lpTokenId/
              `,
            {
              lpTokenId: lpTokenId.toString(),
            }
          );
          if (!orderResult) {
            break;
          }
        }

        orderId = !isUserSell
          ? getSellOrderId(pool.address, tokenId.toString(), lpTokenId.toString())
          : orderResult.id;
        onChainData.fillEventsOnChain.push({
          orderKind,
          orderSide: isUserSell ? "buy" : "sell",
          orderId,
          maker: baseEventParams.address,
          taker,
          price: priceData.nativePrice,
          currencyPrice: price,
          usdPrice: priceData.usdPrice,
          currency: pool.token,
          contract: pool.nft,
          tokenId: tokenId.toString(),
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams: {
            ...baseEventParams,
          },
        });

        onChainData.fillInfos.push({
          context: `midaswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
          orderId,
          orderSide: isUserSell ? "buy" : "sell",
          contract: pool.nft,
          tokenId: tokenId.toString(),
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: baseEventParams.address,
          taker,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId || ""}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              nftId: tokenId.toString(),
              eventName: subKind,
              tradeBin,
              lpTokenId: lpTokenId.toString(),
            },
            metadata: {},
          },
        });
        break;
      }
    }

    logger.info("midaswap-debug", JSON.stringify(onChainData));
  }
};
