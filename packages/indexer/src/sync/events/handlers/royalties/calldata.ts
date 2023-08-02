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
    if (
      [
        "fulfillAvailableAdvancedOrders",
        "fulfillAvailableOrders",
        "matchOrders",
        "matchAdvancedOrders",
      ].includes(funcName)
    ) {
      orders = args[0];
    } else if (["fulfillAdvancedOrder", "fulfillOrder"].includes(funcName)) {
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
