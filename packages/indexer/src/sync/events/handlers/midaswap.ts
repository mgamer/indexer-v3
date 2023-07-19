import { logger } from "@/common/logger";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as midaswapUtils from "@/utils/midaswap";
import { BigNumber } from "ethers";

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
              },
              metadata: {
                eventName: subKind,
                fromOnChain: true,
                lpTokenId: lpTokenId.toString(),
                nftId: nftId.toString(),
                binLower: binLower,
                binstep: binStep,
                binAmount: nftIds.length,
              },
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
            },
            metadata: {
              eventName: subKind,
              fromOnChain: true,
              lpTokenId: lpTokenId.toString(),
              binLower: binLower,
              binstep: binStep,
              binAmount: binAmount.toNumber(),
            },
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
            },
            metadata: {
              eventName: subKind,
              fromOnChain: true,
              lpTokenId: lpTokenId.toString(),
            },
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

        if (!pool) {
          break;
        }

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {
              source: subKind,
              fromOnChain: true,
              nftId: tokenId.toString(),
              eventName: subKind,
              tradeBin,
              lpTokenId: lpTokenId.toString(),
            },
            // },
          },
        });
        break;
      }
    }

    logger.info("midaswap-debug", JSON.stringify(onChainData));
  }
};
