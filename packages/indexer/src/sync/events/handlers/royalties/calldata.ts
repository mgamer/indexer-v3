import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

export function extractOrdersFromCalldata(callData: string) {
  const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
  const basicOrders: Sdk.SeaportBase.BaseOrderInfo[] = [];
  try {
    const { name: funcName, args } = exchange.contract.interface.parseTransaction({
      data: callData,
    });

    let orders = [];
    if (funcName === "fulfillAvailableAdvancedOrders") {
      orders = args[0];
    } else if (funcName === "fulfillAvailableOrders") {
      orders = args[0];
    } else if (funcName === "fulfillAdvancedOrder") {
      orders = [args[0]];
    } else if (funcName === "matchOrders") {
      orders = args[0];
    } else if (funcName === "matchAdvancedOrders") {
      orders = args[0];
    } else if (funcName === "fulfillOrder") {
      orders = [args[0]];
    }

    for (let index = 0; index < orders.length; index++) {
      try {
        const order = new Sdk.SeaportV15.Order(config.chainId, {
          ...orders[index].parameters,
          // the counter is missing
          counter: 0,
        });
        basicOrders.push(order.getInfo()!);
      } catch {
        // Skip erros
      }
    }
  } catch {
    // Skip errors
  }

  return basicOrders;
}
