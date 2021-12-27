import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { orderbookProvider } from "@/common/provider";
import { config } from "@/config/index";
import { ContractInfo } from "@/events/index";

const abi = new Interface([`event OrdersPosted(bytes[] orders)`]);

export const getContractInfo = (address: string[] = []): ContractInfo => ({
  provider: orderbookProvider,
  filter: { address },
  syncCallback: async (logs: Log[]) => {
    // TODO: Add support within the SDK for encoding/decoding
    // orders (it doesn't need to be backwards-compatible, so
    // a simple ABI-encoding would do it).
    // const parsedOrders: Order[] = [];
    // for (const log of logs) {
    //   try {
    //     switch (log.topics[0]) {
    //       case abi.getEventTopic("OrdersPosted"): {
    //         const parsedLog = abi.parseLog(log);
    //         const orders = parsedLog.args.orders;
    //         for (const order of orders) {
    //           const parsedOrder = parseOrderbookOrder(order);
    //           if (parsedOrder) {
    //             parsedOrders.push(parsedOrder);
    //           }
    //         }
    //         break;
    //       }
    //     }
    //   } catch (error) {
    //     logger.error(
    //       "orderbook_callback",
    //       `Could not parse log ${log}: ${error}`
    //     );
    //   }
    // }
    // // Filter and save new and valid orders
    // const filteredOrders = await filterOrders(parsedOrders);
    // await saveOrders(filteredOrders);
  },
  fixCallback: async (_blockHash) => {
    // Not used
  },
  skip: !config.acceptOrders,
});
