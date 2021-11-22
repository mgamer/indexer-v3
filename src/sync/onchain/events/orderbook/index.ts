import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { Order } from "@georgeroman/wyvern-v2-sdk";

import { logger } from "@common/logger";
import { orderbookProvider } from "@common/provider";
import { filterOrders, parseEncodedOrder, saveOrders } from "@orders/wyvern-v2";
import { EventInfo } from "@events/index";

const abi = new Interface([`event OrdersPosted(bytes[] orders)`]);

export const getOrdersPostedEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: orderbookProvider,
  filter: {
    topics: [abi.getEventTopic("OrdersPosted")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const parsedOrders: Order[] = [];
    for (const log of logs) {
      try {
        const parsedLog = abi.parseLog(log);
        const orders = parsedLog.args.orders;

        for (const order of orders) {
          const parsedOrder = parseEncodedOrder(order);
          if (parsedOrder) {
            parsedOrders.push(parsedOrder);
          }
        }
      } catch (error) {
        logger.error(
          "orderbook_orders_posted_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    // Filter and save new and valid orders
    const filteredOrders = await filterOrders(parsedOrders);
    await saveOrders(filteredOrders);
  },
  fixCallback: async (_blockHash) => {
    // Not used
  },
});
