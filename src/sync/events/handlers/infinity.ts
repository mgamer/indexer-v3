/* eslint-disable @typescript-eslint/no-unused-vars */
import { EnhancedEvent, OnChainData } from "./utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import { getEventData } from "../data";
import { idb } from "@/common/db";
import { getUSDAndNativePrices } from "@/utils/prices";
import { OrderKind } from "@/orderbook/orders";
import { lc } from "@reservoir0x/sdk/dist/utils";
import { BigNumberish } from "ethers";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { Sdk } from "@/tmp/index"; // TODO @joe
import { bn } from "@/common/utils";
import { getERC20Transfer } from "./utils/erc20";
import { Log } from "@ethersproject/providers";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const nonceCancelEvents: es.nonceCancels.Event[] = [];

  const fillEvents: es.fills.Event[] = [];
  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);
    const eventData = getEventData([kind])[0];
    const parsedLog = eventData.abi.parseLog(log);

    switch (kind) {
      case "infinity-cancel-all-orders": {
        const newMinNonce = parsedLog.args.newMinNonce as BigNumberish;
        const user = lc(parsedLog.args.user);

        bulkCancelEvents.push({
          orderKind: "infinity",
          maker: user,
          minNonce: newMinNonce.toString(),
          baseEventParams,
          acrossAll: false,
        });
        break;
      }
      case "infinity-cancel-multiple-orders": {
        const nonces = parsedLog.args.orderNonces as BigNumberish[];
        const user = lc(parsedLog.args.user);

        const cancelEvents: es.nonceCancels.Event[] = nonces.map((nonce, index) => {
          return {
            orderKind: "infinity",
            maker: user,
            nonce: nonce.toString(),
            baseEventParams: {
              ...baseEventParams,
              // TODO is this the correct way to support bulk cancels of specific nonces?
              batchIndex: baseEventParams.batchIndex + index,
            },
          };
        });

        nonceCancelEvents.push(...cancelEvents);

        break;
      }

      case "infinity-match-order-fulfilled": {
        const sellOrderHash = parsedLog.args.sellOrderHash;
        const buyOrderHash = parsedLog.args.buyOrderHash;
        const seller = lc(parsedLog.args.seller);
        const buyer = lc(parsedLog.args.buyer);
        // const complication = lc(parsedLog.args.complication);
        const currency = lc(parsedLog.args.currency);
        const currencyPrice = (parsedLog.args.amount as BigNumberish).toString();
        const nfts = parsedLog.args.nfts as Sdk.Infinity.Types.OrderNFTs[];
        const orderKind: OrderKind = "infinity";

        // Handle: cancel orders with the same nonce
        const sellOrderNonce = await getOrderNonce(sellOrderHash, seller);
        const buyOrderNonce = await getOrderNonce(buyOrderHash, buyer);

        if (sellOrderNonce) {
          nonceCancelEvents.push({
            orderKind,
            maker: seller,
            nonce: sellOrderNonce,
            baseEventParams,
          });
        }
        if (buyOrderNonce) {
          nonceCancelEvents.push({
            orderKind,
            maker: buyer,
            nonce: buyOrderNonce,
            baseEventParams,
          });
        }

        // Handle: attribution

        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        // Handle: prices
        const numTokens = nfts.reduce((acc, item) => {
          return (
            acc +
            item.tokens.reduce(
              (collectionNumTokens, token) => collectionNumTokens + token.numTokens,
              0
            )
          );
        }, 0);

        const pricePerToken = bn(currencyPrice).div(numTokens).toString();
        const priceDataPerToken = await getUSDAndNativePrices(
          currency,
          pricePerToken,
          baseEventParams.timestamp
        );
        if (!priceDataPerToken.nativePrice) {
          // We must always have the native price
          break;
        }

        for (const nft of nfts) {
          for (const token of nft.tokens) {
            fillEvents.push({
              orderKind,
              orderId: sellOrderHash,
              orderSide: "sell",
              maker: seller,
              taker: buyer,
              price: priceDataPerToken.nativePrice,
              currency,
              currencyPrice: pricePerToken,
              usdPrice: priceDataPerToken.usdPrice,
              contract: lc(nft.collection),
              tokenId: token.tokenId,
              amount: token.numTokens.toString(),
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams,
            });

            // TODO do we need a separate fill event for the buy order?
            fillEvents.push({
              orderKind,
              orderId: buyOrderHash,
              orderSide: "buy",
              maker: buyer,
              taker: seller,
              price: priceDataPerToken.nativePrice,
              currency,
              currencyPrice: pricePerToken,
              usdPrice: priceDataPerToken.usdPrice,
              contract: lc(nft.collection),
              tokenId: token.tokenId,
              amount: token.numTokens.toString(),
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: `${buyOrderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
              orderId: buyOrderHash,
              orderSide: "buy",
              contract: lc(nft.collection),
              tokenId: token.tokenId,
              amount: token.numTokens.toString(),
              price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
              timestamp: baseEventParams.timestamp,
            });

            // TODO do we need a separate fillInfo item for the seller?
            fillInfos.push({
              context: `${sellOrderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
              orderId: sellOrderHash,
              orderSide: "sell",
              contract: lc(nft.collection),
              tokenId: token.tokenId,
              amount: token.numTokens.toString(),
              price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
              timestamp: baseEventParams.timestamp,
            });
          }
        }

        orderInfos.push({
          context: `filled-${sellOrderHash}`,
          id: sellOrderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });
        orderInfos.push({
          context: `filled-${buyOrderHash}`,
          id: buyOrderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occurred in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker: buyer,
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

        break;
      }

      case "infinity-take-order-fulfilled": {
        const orderHash = parsedLog.args.orderHash;
        const seller = lc(parsedLog.args.seller);
        const buyer = lc(parsedLog.args.buyer);
        // const complication = lc(parsedLog.args.complication);
        const currency = lc(parsedLog.args.currency);
        const currencyPrice = (parsedLog.args.amount as BigNumberish).toString();
        const nfts = parsedLog.args.nfts as Sdk.Infinity.Types.OrderNFTs[];
        const orderKind: OrderKind = "infinity";

        const sides = await getOrderSide(orderHash, seller, buyer);

        // Handle: cancel orders
        if (sides) {
          nonceCancelEvents.push({
            orderKind,
            maker: sides.maker,
            nonce: sides.nonce,
            baseEventParams,
          });
        }

        // Handle: attribution

        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        // Handle: prices
        const numTokens = nfts.reduce((acc, item) => {
          return (
            acc +
            item.tokens.reduce(
              (collectionNumTokens: number, token) => collectionNumTokens + token.numTokens,
              0
            )
          );
        }, 0);

        const pricePerToken = bn(currencyPrice).div(numTokens).toString();
        const priceDataPerToken = await getUSDAndNativePrices(
          currency,
          pricePerToken,
          baseEventParams.timestamp
        );
        if (!priceDataPerToken.nativePrice) {
          // We must always have the native price
          break;
        }

        if (sides) {
          const orderSide = sides.isSellOrder ? "sell" : "buy";
          for (const nft of nfts) {
            for (const token of nft.tokens) {
              fillEvents.push({
                orderKind,
                orderId: orderHash,
                orderSide,
                maker: sides.maker,
                taker: sides.taker,
                price: priceDataPerToken.nativePrice,
                currency,
                currencyPrice: pricePerToken,
                usdPrice: priceDataPerToken.usdPrice,
                contract: lc(nft.collection),
                tokenId: token.tokenId,
                amount: token.numTokens.toString(),
                orderSourceId: attributionData.orderSource?.id,
                aggregatorSourceId: attributionData.aggregatorSource?.id,
                fillSourceId: attributionData.fillSource?.id,
                baseEventParams,
              });

              fillInfos.push({
                context: `${orderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
                orderId: orderHash,
                orderSide,
                contract: lc(nft.collection),
                tokenId: token.tokenId,
                amount: token.numTokens.toString(),
                price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
                timestamp: baseEventParams.timestamp,
              });
            }
          }
        }

        orderInfos.push({
          context: `filled-${orderHash}`,
          id: orderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occurred in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker: buyer,
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

        break;
      }
    }
  }

  return {
    nonceCancelEvents,
    fillEvents,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};

async function getOrderNonce(orderHash: string, maker: string): Promise<string | null> {
  const result = await idb.oneOrNone(
    `
          SELECT
            orders.id,
            orders.nonce
          FROM orders
          WHERE orders.kind = 'infinity'
            AND orders.id = $/orderHash/
            AND orders.maker = $/maker/
          LIMIT 1
        `,
    {
      orderHash,
      maker: lc(maker),
    }
  );

  if (result?.nonce) {
    return (result.nonce as BigNumberish).toString();
  }

  return null;
}

async function getOrderSide(orderHash: string, seller: string, buyer: string) {
  const sellerOrderNonce = await getOrderNonce(orderHash, seller);

  if (sellerOrderNonce) {
    return {
      maker: seller,
      taker: buyer,
      isSellOrder: true,
      nonce: sellerOrderNonce,
    };
  }
  const buyerOrderNonce = await getOrderNonce(orderHash, buyer);
  if (buyerOrderNonce) {
    return {
      maker: buyer,
      taker: seller,
      isSellOrder: false,
      nonce: buyerOrderNonce,
    };
  }

  return null;
}
