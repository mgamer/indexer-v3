import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  CancelEvent,
  addCancelEvents,
  removeCancelEvents,
} from "@/events/common/cancels";
import {
  FillEvent,
  addFillEvents,
  removeFillEvents,
} from "@/events/common/fills";
import { EventInfo } from "@/events/index";
import { parseEvent } from "@/events/parser";
import { HashInfo, addToOrdersUpdateByHashQueue } from "@/jobs/orders-update";

const abi = new Interface([
  `event OrderCancelled(
    bytes32 indexed hash
  )`,
  `event OrdersMatched(
    bytes32 buyHash,
    bytes32 sellHash,
    address indexed maker,
    address indexed taker,
    uint256 price,
    bytes32 indexed metadata
  )`,
]);

export const getOrderCancelledEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("OrderCancelled")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const cancelEvents: CancelEvent[] = [];
    const hashInfos: HashInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const orderHash = parsedLog.args.hash.toLowerCase();

        cancelEvents.push({
          orderHash,
          baseParams,
        });

        hashInfos.push({ hash: orderHash });
      } catch (error) {
        logger.error(
          "wyvern_v2_order_cancelled_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addCancelEvents("wyvern-v2", cancelEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByHashQueue(hashInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeCancelEvents(blockHash);
  },
});

export const getOrdersMatchedEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("OrdersMatched")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const fillEvents: FillEvent[] = [];
    const hashInfos: HashInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const buyHash = parsedLog.args.buyHash.toLowerCase();
        const sellHash = parsedLog.args.sellHash.toLowerCase();
        const maker = parsedLog.args.maker.toLowerCase();
        const taker = parsedLog.args.taker.toLowerCase();
        const price = parsedLog.args.price.toString();

        fillEvents.push({
          buyHash,
          sellHash,
          maker,
          taker,
          price,
          baseParams,
        });

        hashInfos.push({ hash: buyHash });
        hashInfos.push({ hash: sellHash });
      } catch (error) {
        logger.error(
          "wyvern_v2_orders_matched_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addFillEvents("wyvern-v2", fillEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByHashQueue(hashInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeFillEvents(blockHash);
  },
});
