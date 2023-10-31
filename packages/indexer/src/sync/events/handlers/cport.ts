import { Log } from "@ethersproject/abstract-provider";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import * as utils from "@/events-sync/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
// import * as paymentProcessor from "@/orderbook/orders/payment-processor";
import * as paymentProcessorUtils from "@/utils/payment-processor";
import { getUSDAndNativePrices } from "@/utils/prices";
import { defaultAbiCoder } from "@ethersproject/abi";
// import { baseProvider } from "@/common/provider";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    order: new Map<string, number>(),
  };

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      // case "payment-processor-nonce-invalidated": {
      //   const parsedLog = eventData.abi.parseLog(log);
      //   const maker = parsedLog.args["account"].toLowerCase();
      //   const nonce = parsedLog.args["nonce"].toString();
      //   const marketplace = parsedLog.args["marketplace"].toLowerCase();
      //   const orderNonce = paymentProcessor.getOrderNonce(marketplace, nonce);

      //   onChainData.nonceCancelEvents.push({
      //     orderKind: "payment-processor",
      //     maker,
      //     nonce: orderNonce,
      //     baseEventParams,
      //   });

      //   break;
      // }

      // case "payment-processor-master-nonce-invalidated": {
      //   const parsedLog = eventData.abi.parseLog(log);
      //   const maker = parsedLog.args["account"].toLowerCase();
      //   const newNonce = parsedLog.args["nonce"].toString();

      //   // Cancel all maker's orders
      //   onChainData.bulkCancelEvents.push({
      //     orderKind: "payment-processor",
      //     maker,
      //     minNonce: newNonce,
      //     acrossAll: true,
      //     baseEventParams,
      //   });

      //   break;
      // }

      case "cport-accept-offer-erc1155":
      case "cport-accept-offer-erc721":
      case "cport-buy-listing-erc1155":
      case "cport-buy-listing-erc721": {
        // Again the events are extremely poorly designed (order hash is not emitted)
        // so we have to rely on complex tricks (using call tracing) to associate the
        // sales to order ids

        const txHash = baseEventParams.txHash;
        const tx = await utils.fetchTransaction(txHash);
        const parsedLog = eventData.abi.parseLog(log);

        const exchange = new Sdk.CPort.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;

        // console.log("buyListing", exchange.contract.interface.getSighash("buyListing"));
        // console.log(
        //   "buyListingWithFeeOnTop",
        //   exchange.contract.interface.getSighash("buyListingWithFeeOnTop")
        // );
        // console.log(
        //   "buyListingCosigned",
        //   exchange.contract.interface.getSighash("buyListingCosigned")
        // );
        // console.log(
        //   "buyListingCosignedWithFeeOnTop",
        //   exchange.contract.interface.getSighash("buyListingCosignedWithFeeOnTop")
        // );

        // console.log("acceptOffer", exchange.contract.interface.getSighash("acceptOffer"));
        // console.log(
        //   "acceptOfferWithFeeOnTop",
        //   exchange.contract.interface.getSighash("acceptOfferWithFeeOnTop")
        // );
        // console.log(
        //   "acceptOfferCosigned",
        //   exchange.contract.interface.getSighash("acceptOfferCosigned")
        // );
        // console.log(
        //   "acceptOfferCosignedWithFeeOnTop",
        //   exchange.contract.interface.getSighash("acceptOfferCosignedWithFeeOnTop")
        // );

        let relevantCalldata: string | undefined;
        const methods = [
          {
            selector: "0xc32dacae",
            name: "buyListing",
            abi: [
              "bytes32 domainSeparator",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount) saleDetails",
              "(uint8 v,bytes32 r,bytes32 s) sellerSignature",
            ],
          },
          // {
          //   selector: "0x5a0f8645",
          //   name: "buyListingWithFeeOnTop",
          //   abi: []
          // },
          // {
          //   selector: "0xca893dbb",
          //   name: "buyListingCosigned",
          //   abi: []
          // },
          // {
          //   selector: "0x897c76ce",
          //   name: "buyListingCosignedWithFeeOnTop",
          //   abi: []
          // },
          {
            selector: "0x08fdd68e",
            name: "acceptOffer",
            abi: [
              "bytes32 domainSeparator",
              "bool isCollectionLevelOffer",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount) saleDetails",
              "(uint8 v,bytes32 r,bytes32 s) buyerSignature",
              "(bytes32 rootHash,bytes32[] proof) tokenSetProof",
            ],
          },
          // {
          //   selector: "0x95e06261",
          //   name: "acceptOfferWithFeeOnTop",
          //   abi: []
          // },
          // {
          //   selector: "0x46125a3c",
          //   name: "acceptOfferCosigned",
          //   abi: []
          // },
          // {
          //   selector: "0x5ec376e7",
          //   name: "acceptOfferCosignedWithFeeOnTop",
          //   abi: []
          // },
        ];

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (txTrace) {
          try {
            const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
            const executeCallTrace = searchForCall(
              txTrace.calls,
              {
                to: exchangeAddress,
                type: "CALL",
                sigHashes: methods.map((c) => c.selector),
              },
              tradeRank
            );

            if (executeCallTrace) {
              relevantCalldata = executeCallTrace.input ?? "0x";
              trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);
            }
          } catch {
            relevantCalldata = tx.data;
          }
        } else {
          relevantCalldata = tx.data;
        }

        if (!relevantCalldata) {
          break;
        }

        const matchedMethod = methods.find((c) => relevantCalldata!.includes(c.selector));
        if (!matchedMethod) {
          break;
        }

        // console.log("matchedMethod", matchedMethod);

        const agrs = exchange.contract.interface.decodeFunctionData(
          matchedMethod.name,
          relevantCalldata!
        );

        const inputData = defaultAbiCoder.decode(matchedMethod.abi, agrs.data);

        const isBatch = matchedMethod.name === "buyBatchOfListings";
        const saleDetailsArray = isBatch ? inputData.saleDetailsArray : [inputData.saleDetails];
        const saleSignatures = isBatch
          ? inputData.signedListings
          : [inputData.buyerSignature || inputData.sellerSignature];

        for (let i = 0; i < saleDetailsArray.length; i++) {
          const [saleDetail, saleSignature] = [saleDetailsArray[i], saleSignatures[i]];

          const tokenAddress = saleDetail["tokenAddress"].toLowerCase();
          const tokenId = saleDetail["tokenId"].toString();
          const amount = saleDetail["amount"].toString();
          const currency = saleDetail["paymentMethod"].toLowerCase();
          const currencyPrice = saleDetail["itemPrice"].div(saleDetail["amount"]).toString();

          const orderBeneficiary = saleDetail["beneficiary"].toLowerCase();
          const orderMaker = saleDetail["maker"].toLowerCase();

          // const caller = tx.from.toLowerCase();

          const isBuyOrder = orderBeneficiary != orderMaker ? false : true;
          const maker = isBuyOrder
            ? parsedLog.args["buyer"].toLowerCase()
            : parsedLog.args["buyer"].toLowerCase();

          let taker = isBuyOrder
            ? parsedLog.args["seller"].toLowerCase()
            : parsedLog.args["seller"].toLowerCase();

          const orderSide = !isBuyOrder ? "sell" : "buy";

          // console.log({
          //   caller,
          //   orderSide,
          //   maker,
          //   taker,
          //   orderBeneficiary,
          //   orderMaker,
          //   event: {
          //     buyer: parsedLog.args['buyer'].toLowerCase(),
          //     seller: parsedLog.args['seller'].toLowerCase()
          //   }
          // })

          // let taker = isBuyOrder ? seller : buyer;
          // const maker = isBuyOrder ? buyer : seller;
          const makerMinNonce = await commonHelpers.getMinNonce("cport", maker);

          // const isCollectionLevel = saleDetail["collectionLevelOffer"];
          const singleBuilder = new Sdk.CPort.Builders.SingleToken(config.chainId);
          // const contractBuilder = new Sdk.CPort.Builders.ContractWide(config.chainId);

          const orderSignature = saleSignature;
          const signature = {
            r: orderSignature.r,
            s: orderSignature.s,
            v: orderSignature.v,
          };

          const order = singleBuilder.build({
            protocol: saleDetail["protocol"],
            marketplace: saleDetail["marketplace"],
            marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
            maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
            tokenAddress: saleDetail["tokenAddress"],
            amount: saleDetail["amount"],
            tokenId: saleDetail["tokenId"],
            expiration: saleDetail["expiration"],
            price: saleDetail["itemPrice"],
            trader: saleDetail["maker"],
            ...(isBuyOrder
              ? {
                  beneficiary: saleDetail["beneficiary"],
                }
              : {}),
            nonce: saleDetail["nonce"],
            paymentMethod: saleDetail["paymentMethod"],
            masterNonce: makerMinNonce,
            ...signature,
          });

          let isValidated = false;
          for (let nonce = Number(order.params.masterNonce); nonce >= 0; nonce--) {
            order.params.masterNonce = nonce.toString();
            try {
              order.checkSignature();
              isValidated = true;
              break;
            } catch {
              // Skip errors
            }
          }

          // console.log("isBuyOrder", isBuyOrder);
          // console.log("isValidated", isValidated);
          // console.log("order", order);

          const priceData = await getUSDAndNativePrices(
            currency,
            currencyPrice,
            baseEventParams.timestamp
          );
          if (!priceData.nativePrice) {
            // We must always have the native price
            break;
          }

          const orderId = isValidated ? order.hash() : undefined;

          // Handle: attribution
          const orderKind = "cport";
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );
          if (attributionData.taker) {
            taker = attributionData.taker;
          }

          onChainData.fillEvents.push({
            orderId,
            orderKind: "cport",
            orderSide,
            maker,
            taker,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract: tokenAddress,
            tokenId,
            amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });

          onChainData.fillInfos.push({
            context: `${orderId}-${baseEventParams.txHash}`,
            orderId: orderId,
            orderSide,
            contract: tokenAddress,
            tokenId,
            amount,
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker,
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

          // If an ERC20 transfer occured in the same transaction as a sale
          // then we need resync the maker's ERC20 approval to the exchange
          const erc20 = getERC20Transfer(currentTxLogs);
          if (erc20) {
            onChainData.makerInfos.push({
              context: `${baseEventParams.txHash}-buy-approval`,
              maker,
              trigger: {
                kind: "approval-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-approval",
                contract: erc20,
                orderKind,
              },
            });
          }
        }

        break;
      }

      // case "payment-processor-sweep-collection-erc721":
      // case "payment-processor-sweep-collection-erc1155": {
      //   const txHash = baseEventParams.txHash;
      //   const tx = await utils.fetchTransaction(txHash);

      //   const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
      //   const exchangeAddress = exchange.contract.address;

      //   let relevantCalldata: string | undefined;
      //   const methods = [
      //     {
      //       selector: "0xd3055dde",
      //       name: "sweepCollection",
      //     },
      //   ];

      //   const txTrace = await utils.fetchTransactionTrace(txHash);
      //   if (txTrace) {
      //     try {
      //       const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
      //       const executeCallTrace = searchForCall(
      //         txTrace.calls,
      //         {
      //           to: exchangeAddress,
      //           type: "CALL",
      //           sigHashes: methods.map((c) => c.selector),
      //         },
      //         tradeRank
      //       );

      //       if (executeCallTrace) {
      //         relevantCalldata = executeCallTrace.input;
      //         trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);
      //       }
      //     } catch {
      //       relevantCalldata = tx.data;
      //     }
      //   } else {
      //     relevantCalldata = tx.data;
      //   }

      //   const matchedMethod = methods.find((c) => relevantCalldata!.includes(c.selector));
      //   if (!matchedMethod) {
      //     break;
      //   }

      //   const inputData = exchange.contract.interface.decodeFunctionData(
      //     matchedMethod.name,
      //     relevantCalldata!
      //   );

      //   const parsedLog = eventData.abi.parseLog(log);
      //   const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();
      //   const tokenIds = parsedLog.args["tokenIds"].map(String);
      //   const currency = parsedLog.args["paymentCoin"].toLowerCase();
      //   const buyer = parsedLog.args["buyer"].toLowerCase();
      //   const unsuccessfulFills = parsedLog.args["unsuccessfulFills"];
      //   const bundleDetails = inputData.bundleDetails;

      //   for (let i = 0; i < tokenIds.length; i++) {
      //     if (!unsuccessfulFills[i]) {
      //       const amount = subKind.endsWith("erc1155")
      //         ? parsedLog.args["amounts"][i].toString()
      //         : "1";

      //       const tokenId = tokenIds[i];
      //       const currencyPrice = parsedLog.args["salePrices"][i].div(amount).toString();
      //       const seller = parsedLog.args["sellers"][i].toLowerCase();
      //       const bundleItem = inputData.bundleItems[i];
      //       const signedListing = inputData.signedListings[i];

      //       const singleBuilder = new Sdk.PaymentProcessor.Builders.SingleToken(config.chainId);
      //       const sellerMinNonce = await commonHelpers.getMinNonce(
      //         "payment-processor",
      //         bundleItem["seller"].toLowerCase()
      //       );

      //       const order = singleBuilder.build({
      //         protocol: bundleDetails["protocol"],
      //         sellerAcceptedOffer: false,
      //         marketplace: bundleDetails["marketplace"],
      //         marketplaceFeeNumerator: bundleDetails["marketplaceFeeNumerator"],
      //         tokenAddress: bundleDetails["tokenAddress"],
      //         maxRoyaltyFeeNumerator: bundleItem["maxRoyaltyFeeNumerator"],
      //         coin: bundleDetails["paymentCoin"],
      //         masterNonce: sellerMinNonce,
      //         trader: bundleItem["seller"],
      //         amount: bundleItem["amount"],
      //         tokenId: bundleItem["tokenId"],
      //         price: bundleItem["itemPrice"],
      //         expiration: bundleItem["listingExpiration"],
      //         nonce: bundleItem["listingNonce"],
      //         ...signedListing,
      //       });

      //       let isValidated = false;
      //       for (let nonce = Number(order.params.masterNonce); nonce >= 0; nonce--) {
      //         order.params.masterNonce = nonce.toString();
      //         try {
      //           order.checkSignature();
      //           isValidated = true;
      //           break;
      //         } catch {
      //           // Skip errors
      //         }
      //       }

      //       const orderId = isValidated ? order.hash() : undefined;

      //       const priceData = await getUSDAndNativePrices(
      //         currency,
      //         currencyPrice,
      //         baseEventParams.timestamp
      //       );
      //       if (!priceData.nativePrice) {
      //         // We must always have the native price
      //         break;
      //       }

      //       // Handle: attribution
      //       const orderKind = "payment-processor";
      //       const attributionData = await utils.extractAttributionData(
      //         baseEventParams.txHash,
      //         orderKind,
      //         {
      //           orderId,
      //         }
      //       );

      //       const orderSide = "sell";

      //       onChainData.fillEvents.push({
      //         orderId,
      //         orderKind: "payment-processor",
      //         orderSide,
      //         maker: seller,
      //         taker: buyer,
      //         price: priceData.nativePrice,
      //         currency,
      //         currencyPrice,
      //         usdPrice: priceData.usdPrice,
      //         contract: tokenAddress,
      //         tokenId,
      //         amount,
      //         orderSourceId: attributionData.orderSource?.id,
      //         aggregatorSourceId: attributionData.aggregatorSource?.id,
      //         fillSourceId: attributionData.fillSource?.id,
      //         baseEventParams: {
      //           ...baseEventParams,
      //           batchIndex: baseEventParams.batchIndex + i,
      //         },
      //       });

      //       onChainData.fillInfos.push({
      //         context: `${orderId}-${baseEventParams.txHash}`,
      //         orderId: orderId,
      //         orderSide,
      //         contract: tokenAddress,
      //         tokenId,
      //         amount,
      //         price: priceData.nativePrice,
      //         timestamp: baseEventParams.timestamp,
      //         maker: seller,
      //         taker: buyer,
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

      //       // If an ERC20 transfer occured in the same transaction as a sale
      //       // then we need resync the maker's ERC20 approval to the exchange
      //       const erc20 = getERC20Transfer(currentTxLogs);
      //       if (erc20) {
      //         onChainData.makerInfos.push({
      //           context: `${baseEventParams.txHash}-buy-approval`,
      //           maker: seller,
      //           trigger: {
      //             kind: "approval-change",
      //             txHash: baseEventParams.txHash,
      //             txTimestamp: baseEventParams.timestamp,
      //           },
      //           data: {
      //             kind: "buy-approval",
      //             contract: erc20,
      //             orderKind,
      //           },
      //         });
      //       }
      //     }
      //   }

      //   break;
      // }

      case "payment-processor-created-or-updated-security-policy": {
        const parsedLog = eventData.abi.parseLog(log);
        const securityPolicyId = parsedLog.args.securityPolicyId.toString();

        // Refresh
        await paymentProcessorUtils.getSecurityPolicyById(securityPolicyId, true);

        break;
      }

      case "payment-processor-updated-collection-payment-coin":
      case "payment-processor-updated-collection-security-policy": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorUtils.getConfigByContract(tokenAddress, true);

        break;
      }
    }
  }
};
