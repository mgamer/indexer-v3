import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEvents: es.cancels.Event[] = [];
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "forward-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const orderHash = args.orderHash.toLowerCase();
        const side = args.side;
        const maker = args.maker.toLowerCase();
        let taker = args.taker.toLowerCase();
        const token = args.token.toLowerCase();
        const identifier = args.identifier.toString();
        const unitPrice = args.unitPrice.toString();
        const amount = args.amount.toString();

        // Handle: attribution

        // Internal Forward listings have a different order kind so as
        // to have a unified validation logic (eg. escrowed orderbooks
        // need different validation)
        const orderKind = "forward";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        const currency =
          side === Sdk.Forward.Types.Side.BID
            ? Sdk.Common.Addresses.Weth[config.chainId]
            : Sdk.Common.Addresses.Eth[config.chainId];
        const currencyPrice = unitPrice;
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = side === Sdk.Forward.Types.Side.BID ? "buy" : "sell";
        const orderId = orderHash;
        fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: token,
          tokenId: identifier,
          amount: amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide,
          contract: token,
          tokenId: identifier,
          amount: amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          makerInfos.push({
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
              orderKind: "seaport",
            },
          });
        }

        break;
      }

      case "forward-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();

        cancelEvents.push({
          // TODO: Review comment
          // The order kind might be wrong (eg. no way to differentiate between
          // 'forward' and 'forward-internal') but it doesn't matter because we
          // have the orders uniquely identified by the id (regardless of their
          // kind) - so we just use "forward" here by default
          orderKind: "forward",
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
            logIndex: baseEventParams.logIndex,
            batchIndex: baseEventParams.batchIndex,
            blockHash: baseEventParams.blockHash,
          },
        });

        break;
      }

      case "forward-counter-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["maker"].toLowerCase();
        const newCounter = parsedLog.args["newCounter"].toString();

        bulkCancelEvents.push({
          // TODO: Review comment
          // When validating the counter for any 'forward' order, we should
          // always make sure to check against the 'forward' order kind and
          // not against 'forward-internal'
          orderKind: "forward",
          maker,
          minNonce: newCounter,
          baseEventParams,
        });

        break;
      }
    }
  }

  return {
    cancelEvents,
    bulkCancelEvents,
    fillEventsPartial,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
