import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getMinNonce } from "@/orderbook/orders/common/helpers";

export const extractOrdersFromCalldata = async (calldata: string) => {
  const exchange = new Sdk.SeaportV15.Exchange(config.chainId);

  const basicOrders: Sdk.SeaportBase.BaseOrderInfo[] = [];
  try {
    const { name: funcName, args } = exchange.contract.interface.parseTransaction({
      data: calldata,
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

    for (let i = 0; i < orders.length; i++) {
      try {
        const order = new Sdk.SeaportV15.Order(config.chainId, {
          ...orders[i].parameters,
          counter: await getMinNonce("seaport-v1.5", orders[i].parameters.offerer),
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
};
