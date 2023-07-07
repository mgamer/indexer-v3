import { logger } from "@/common/logger";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as midaswap from "@/orderbook/orders/midaswap";
import * as midaswapUtils from "@/utils/midaswap";
import { BigNumber } from "ethers";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  // const trades = {
  //   buy: new Map<string, number>(),
  //   sell: new Map<string, number>(),
  // };

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
              // nftId: nftId.toString(),
            },
          },
        });

        midaswap.save(
          nftIds.map((nftId: BigNumber) => ({
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
          }))
        );
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
            },
          },
        });

        midaswap.save([
          {
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
        ]);

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

        midaswap.save([
          {
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
        ]);

        break;
      }

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
            },
          },
        });

        await midaswap.save([
          {
            // kind: "midaswap",
            // info: {
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
        ]);

        break;
      }

      case "midaswap-sell-erc721": {
        // const swapNFTsForToken = "0xb1d3f1c1";

        // const txHash = baseEventParams.txHash;
        // const address = baseEventParams.address;

        // onChainData.orders.push({
        //   kind: "midaswap",
        //   info: {
        //     orderParams: {
        //       pool: baseEventParams.address,
        //       txHash: baseEventParams.txHash,
        //       txTimestamp: baseEventParams.timestamp,
        //       txBlock: baseEventParams.block,
        //       logIndex: baseEventParams.logIndex,
        //     },
        //     metadata: {},
        //   },
        // });

        // const txTrace = await utils.fetchTransactionTrace(txHash);
        // if (!txTrace) {
        //   // Skip any failed attempts to get the trace
        //   break;
        // }

        // // Search for the corresponding internal call to the Sudoswap pool
        // const tradeRank = trades.sell.get(`${txHash}-${address}`) ?? 0;
        // const poolCallTrace = searchForCall(
        //   txTrace.calls,
        //   { to: address, type: "CALL", sigHashes: [swapNFTsForToken] },
        //   tradeRank
        // );

        // if (poolCallTrace?.output === "0x") {
        //   // Sometimes there can be upstream bugs and the call's output gets truncated
        //   logger.error(
        //     "midaswap-events-handler",
        //     `Trace missing output: ${baseEventParams.block} - ${baseEventParams.txHash}`
        //   );
        // }

        // if (poolCallTrace) {
        //   const sighash = poolCallTrace.input.slice(0, 10);
        //   const pool = await sudoswapUtils.getPoolDetails(baseEventParams.address);
        //   const isERC1155 = subKind.endsWith("erc1155");

        //   if (pool && sighash === swapNFTsForToken) {
        //     const iface = new Interface([
        //       `
        //         function swapNFTsForToken(
        //           uint256[] calldata nftIds,
        //           uint256 minExpectedTokenOutput,
        //           address payable tokenRecipient,
        //           bool isRouter,
        //           address routerCaller
        //         ) external returns (uint256 outputAmount)
        //       `,
        //     ]);
        //     const decodedInput = iface.decodeFunctionData("swapNFTsForToken", poolCallTrace.input);

        //     // Reference: https://github.com/ledgerwatch/erigon/issues/5308
        //     let estimatedOutputAmount: string | undefined;
        //     if (poolCallTrace.output !== "0x") {
        //       // If the trace's output is available, decode the output amount from that
        //       estimatedOutputAmount = iface
        //         .decodeFunctionResult("swapNFTsForToken", poolCallTrace.output)
        //         .outputAmount.toString();
        //     } else {
        //       // Otherwise, estimate the output amount
        //       estimatedOutputAmount = decodedInput.minExpectedTokenOutput;
        //       if (estimatedOutputAmount === "0") {
        //         estimatedOutputAmount = undefined;
        //       }
        //     }

        //     if (!estimatedOutputAmount) {
        //       // Skip if we can't extract the output amount
        //       break;
        //     }

        //     let taker = decodedInput.tokenRecipient.toLowerCase();

        //     const numItemsSold = isERC1155 ? decodedInput.nftIds[0] : decodedInput.nftIds.length;
        //     const price = bn(estimatedOutputAmount).div(numItemsSold).toString();

        //     // Handle: attribution

        //     const orderKind = "midaswap";
        //     const attributionData = await utils.extractAttributionData(
        //       baseEventParams.txHash,
        //       orderKind
        //     );
        //     if (attributionData.taker) {
        //       taker = attributionData.taker;
        //     }

        //     // Handle: prices

        //     const priceData = await getUSDAndNativePrices(
        //       pool.token,
        //       price,
        //       baseEventParams.timestamp
        //     );
        //     if (!priceData.nativePrice) {
        //       // We must always have the native price
        //       break;
        //     }

        //     for (let i = 0; i < decodedInput.nftIds.length; i++) {
        //       const tokenId = isERC1155 ? pool.tokenId! : decodedInput.nftIds[i].toString();
        //       const amount = isERC1155 ? decodedInput.nftIds[i].toString() : "1";
        //       const orderId = sudoswapV2.getOrderId(
        //         baseEventParams.address,
        //         isERC1155 ? "erc1155" : "erc721",
        //         "buy",
        //         pool.tokenId
        //       );

        //       onChainData.fillEventsPartial.push({
        //         orderKind,
        //         orderSide: "buy",
        //         orderId,
        //         maker: baseEventParams.address,
        //         taker,
        //         price: priceData.nativePrice,
        //         currencyPrice: price,
        //         usdPrice: priceData.usdPrice,
        //         currency: pool.token,
        //         contract: pool.nft,
        //         tokenId,
        //         amount,
        //         orderSourceId: attributionData.orderSource?.id,
        //         aggregatorSourceId: attributionData.aggregatorSource?.id,
        //         fillSourceId: attributionData.fillSource?.id,
        //         baseEventParams: {
        //           ...baseEventParams,
        //           batchIndex: i + 1,
        //         },
        //       });

        //       onChainData.fillInfos.push({
        //         context: `midaswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
        //         orderSide: "buy",
        //         contract: pool.nft,
        //         tokenId,
        //         amount,
        //         price: priceData.nativePrice,
        //         timestamp: baseEventParams.timestamp,
        //         maker: baseEventParams.address,
        //         taker,
        //       });

        //       onChainData.orderInfos.push({
        //         context: `filled-${orderId}-${baseEventParams.txHash}`,
        //         id: orderId,
        //         trigger: {
        //           kind: "sale",
        //           txHash: baseEventParams.txHash,
        //           txTimestamp: baseEventParams.timestamp,
        //         },
        //       });
        //     }
        //   }
        // }

        // // Keep track of the "sell" trade
        // trades.sell.set(`${txHash}-${address}`, tradeRank + 1);

        break;
      }
    }

    logger.info("midaswap-debug", JSON.stringify(onChainData));
    return onChainData;
  }
};
