import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as utils from "@/events-sync/utils";
// import * as Sdk from "@reservoir0x/sdk";
// import { config } from "@/config/index";
// import { searchForCall } from "@georgeroman/evm-tx-simulator";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  // const trades = {
  //   order: new Map<string, number>(),
  // };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "payment-processor-nonce-invalidated": {
        break;
      }

      case "payment-processor-master-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const newNonce = parsedLog.args["none"].toString();

        onChainData.bulkCancelEvents.push({
          orderKind: "payment-processor",
          maker,
          minNonce: newNonce,
          baseEventParams,
        });
        break;
      }

      case "payment-processor-buy-single-listing": {
        const parsedLog = eventData.abi.parseLog(log);

        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        const buyer = parsedLog.args["buyer"].toLowerCase();
        const seller = parsedLog.args["seller"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        const currency = parsedLog.args["paymentCoin"].toLowerCase();
        const currencyPrice = parsedLog.args["salePrice"].toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );

        priceData.nativePrice = currencyPrice;

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        // Handle: attribution
        const orderKind = "payment-processor";
        const orderId = "";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );

        onChainData.fillEvents.push({
          orderKind: "payment-processor",
          orderSide: "sell",
          maker: seller,
          taker: buyer,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: tokenAddress,
          tokenId: tokenId,
          amount: amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });
        break;
      }

      case "payment-processor-sweep-collection-erc721":
      case "payment-processor-sweep-collection-erc1155": {
        const isERC1155 = subKind === "payment-processor-sweep-collection-erc1155";
        const parsedLog = eventData.abi.parseLog(log);

        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();
        const tokenIds = parsedLog.args["tokenIds"].map(String);
        const currency = parsedLog.args["paymentCoin"].toLowerCase();

        const buyer = parsedLog.args["buyer"].toLowerCase();

        for (let index = 0; index < tokenIds.length; index++) {
          const tokenId = tokenIds[index];
          const currencyPrice = parsedLog.args["salePrices"][index].toString();
          const seller = parsedLog.args["sellers"][index].toLowerCase();

          const priceData = await getUSDAndNativePrices(
            currency,
            currencyPrice,
            baseEventParams.timestamp
          );

          if (!priceData.nativePrice) {
            // We must always have the native price
            break;
          }

          // Handle: attribution
          const orderKind = "payment-processor";
          const orderId = "";
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );

          const amount = isERC1155 ? parsedLog.args["amounts"][index].toString() : "1";
          onChainData.fillEvents.push({
            orderKind: "payment-processor",
            orderSide: "sell",
            maker: seller,
            taker: buyer,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract: tokenAddress,
            tokenId: tokenId,
            amount: amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });
        }
        break;
      }
    }
  }
};
