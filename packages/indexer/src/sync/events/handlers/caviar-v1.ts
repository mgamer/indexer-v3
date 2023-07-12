import { Interface } from "@ethersproject/abi";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId } from "@/orderbook/orders/caviar-v1";
import { getPoolDetails } from "@/utils/caviar-v1";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    const pool = await getPoolDetails(baseEventParams.address);

    logger.info("caviar-v1", `caviar-v1: ${JSON.stringify(eventData)}`);

    onChainData.orders.push({
      kind: "caviar-v1",
      info: {
        orderParams: {
          pool: baseEventParams.address,
          txHash: baseEventParams.txHash,
          txTimestamp: baseEventParams.timestamp,
          txBlock: baseEventParams.block,
          logIndex: baseEventParams.logIndex,
        },
        metadata: {},
      },
    });

    const iface = new Interface([
      `
        function nftBuy(
          uint256[] calldata tokenIds,
          uint256 maxInputAmount,
          uint256 deadline
        ) returns (uint256 inputAmount)
      `,
      `
        function nftSell(
          uint256[] tokenIds, 
          uint256 minOutputAmount, 
          uint256 deadline, 
          bytes32[][] proofs, 
          (bytes32 id, bytes payload, uint256 timestamp, bytes signature)[] messages
        ) returns (uint256 inputAmount)
      `,
    ]);

    switch (subKind) {
      case "caviar-v1-buy": {
        const parsedLog = eventData.abi.parseLog(log);

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          break;
        }

        const callTrace = searchForCall(
          txTrace.calls,
          {
            to: baseEventParams.address,
            type: "CALL",
            sigHashes: [iface.getSighash("nftBuy")],
          },
          0
        );

        if (!callTrace) {
          logger.error(
            "caviar-v1-buy",
            `No call trace found: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );

          break;
        }

        const { tokenIds } = iface.decodeFunctionData("nftBuy", callTrace.input);
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        const price = bn(parsedLog.args.inputAmount).div(tokenIds.length).toString();
        const priceData = await getUSDAndNativePrices(
          pool.baseToken,
          price,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          break;
        }

        const orderKind = "caviar-v1";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        for (let i = 0; i < tokenIds.length; i++) {
          const tokenId = tokenIds[i].toString();
          const orderId = getOrderId(baseEventParams.address, "sell", tokenId);

          onChainData.fillEventsOnChain.push({
            orderKind,
            orderSide: "sell",
            orderId,
            maker: baseEventParams.address,
            taker,
            price: priceData.nativePrice,
            currencyPrice: price,
            usdPrice: priceData.usdPrice,
            currency: pool.baseToken,
            contract: pool.nft,
            tokenId,
            amount: "1",
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams: {
              ...baseEventParams,
              batchIndex: i + 1,
            },
          });

          onChainData.fillInfos.push({
            context: `caviar-v1-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
            orderSide: "sell",
            contract: pool.nft,
            tokenId,
            amount: "1",
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker: baseEventParams.address,
            taker,
          });

          onChainData.orderInfos.push({
            context: `filled-${orderId}-${baseEventParams.txHash}`,
            id: orderId,
            trigger: {
              kind: "sale",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
          });
        }

        break;
      }

      case "caviar-v1-sell": {
        const parsedLog = eventData.abi.parseLog(log);

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          break;
        }

        const callTrace = searchForCall(
          txTrace.calls,
          {
            to: baseEventParams.address,
            type: "CALL",
            sigHashes: [iface.getSighash("nftSell")],
          },
          0
        );

        if (!callTrace) {
          logger.error(
            "caviar-v1-sell",
            `No call trace found: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );
          break;
        }

        const { tokenIds } = iface.decodeFunctionData("nftSell", callTrace.input);
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        const price = bn(parsedLog.args.outputAmount).div(tokenIds.length).toString();
        const priceData = await getUSDAndNativePrices(
          pool.baseToken,
          price,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          break;
        }

        const orderKind = "caviar-v1";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        for (let i = 0; i < tokenIds.length; i++) {
          const tokenId = tokenIds[i].toString();
          const orderId = getOrderId(baseEventParams.address, "buy");

          onChainData.fillEventsPartial.push({
            orderKind,
            orderSide: "buy",
            orderId,
            maker: baseEventParams.address,
            taker,
            price: priceData.nativePrice,
            currencyPrice: price,
            usdPrice: priceData.usdPrice,
            currency: pool.baseToken,
            contract: pool.nft,
            tokenId,
            amount: "1",
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams: {
              ...baseEventParams,
              batchIndex: i + 1,
            },
          });

          onChainData.fillInfos.push({
            context: `caviar-v1-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
            orderSide: "buy",
            contract: pool.nft,
            tokenId,
            amount: "1",
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker: baseEventParams.address,
            taker,
          });

          onChainData.orderInfos.push({
            context: `filled-${orderId}-${baseEventParams.txHash}`,
            id: orderId,
            trigger: {
              kind: "sale",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
          });
        }

        break;
      }
    }
  }
};
