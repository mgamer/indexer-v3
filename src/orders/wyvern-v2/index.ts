import * as Sdk from "@reservoir0x/sdk";

import { BuildOrderOptions, buildOrder } from "@/orders/wyvern-v2/build";
import { filterOrders } from "@/orders/wyvern-v2/filter";
import { saveOrders } from "@/orders/wyvern-v2/save";

export type OrderInfo = {
  order: Sdk.WyvernV2.Order;
  attribute?: {
    collection: string;
    key: string;
    value: string;
  };
};

export { BuildOrderOptions, buildOrder, filterOrders, saveOrders };
