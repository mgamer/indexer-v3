// import { idb } from "@/common/db";
// import { bn, fromBuffer } from "@/common/utils";
// import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
// import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as utils from "@/events-sync/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    order: new Map<string, number>(),
  };

  // Handle the events
  for (const {
    subKind,
    baseEventParams,
    // log
  } of events) {
    // const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "blend-loan-offer-taken": {
        // const { args } = eventData.abi.parseLog(log);

        // const offerHash = args.offerHash;
        // const lienId = args.lienId.toString();
        // const collection = args.collection.toLowerCase();
        // const lender = args.lender.toLowerCase();
        // const borrower = args.borrower.toLowerCase();
        // const loanAmount = args.loanAmount.toString();
        // const rate = args.rate.toString();
        // const tokenId = args.tokenId.toString();
        // const auctionDuration = args.auctionDuration.toString();

        // console.log("args", {
        //     offerHash,
        //     lienId,
        //     collection,
        //     lender,
        //     borrower,
        //     loanAmount,
        //     rate,
        //     tokenId,
        //     auctionDuration
        // })

        break;
      }

      case "blend-buy-locked": {
        // const { args } = eventData.abi.parseLog(log);

        const txHash = baseEventParams.txHash;
        const txTrace = await utils.fetchTransactionTrace(txHash);
        // console.log(txTrace)
        if (!txTrace) {
          // console.log("no")
          // Skip any failed attempts to get the trace
          break;
        }

        const exchange = new Sdk.Blend.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;

        const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
        const executeCallTrace = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "CALL", sigHashes: ["0xe7efc178"] },
          tradeRank
        );

        // console.log('executeCallTrace', executeCallTrace, tradeRank, exchangeAddress)
        if (executeCallTrace) {
          const inputData = exchange.contract.interface.decodeFunctionData(
            "buyLocked",
            executeCallTrace.input
          );
          // console.log('inputData', inputData);
          // Handle: prices
          // const currency = Sdk.Blur.Addresses.Beth[config.chainId];
          const currency = Sdk.Common.Addresses.Eth[config.chainId];

          // const currency =
          // sell.paymentToken.toLowerCase() === Sdk.Blur.Addresses.Beth[config.chainId]
          //   ? Sdk.Common.Addresses.Eth[config.chainId]
          //   : sell.paymentToken.toLowerCase();

          const currencyPrice = inputData.offer.price.toString();

          // console.log(inputData.lien.amount.toString())
          // console.log(inputData.offer.price.toString())

          const lien = inputData.lien;

          const priceData = await getUSDAndNativePrices(
            currency,
            currencyPrice,
            baseEventParams.timestamp
          );

          if (!priceData.nativePrice) {
            // We must always have the native price
            break;
          }

          // const offer = inputData.offer;
          // const order = new Sdk.Blend.Order(config.chainId, {
          //     borrower: offer.borrower,
          //     lienId: offer.lienId.toString(),
          //     price: offer.price.toString(),
          //     expirationTime: offer.expirationTime,
          //     salt: offer.salt,
          //     oracle: offer.oracle,
          //     fees: [],
          //     nonce: nonce.toString()
          // });

          const orderId = "";

          // Handle: attribution
          const orderKind = "blur";

          let taker = executeCallTrace.from;
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );

          if (attributionData.taker) {
            taker = attributionData.taker;
          }

          const maker = inputData.offer.borrower.toLowerCase();

          onChainData.fillEvents.push({
            orderKind: "blend",
            orderId: "",
            orderSide: "sell",
            maker,
            taker,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract: lien.collection.toLowerCase(),
            tokenId: lien.tokenId.toString(),
            amount: "1",
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });
        }

        // console.log("txTrace", txTrace)

        break;
      }
    }
  }
};
