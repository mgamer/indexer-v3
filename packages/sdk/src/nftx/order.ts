import * as Types from "./types";
import { lc, s } from "../utils";
import { Provider } from "@ethersproject/abstract-provider";
import { getPoolPriceFrom0x } from "./helpers";

export class Order {
  public chainId: number;
  public params: Types.OrderParams;

  constructor(chainId: number, params: Types.OrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  routeVia0x() {
    return this.params.path.length === 0;
  }

  async getQuote(count: number, slippage: number, provider: Provider) {
    const side = this.params.specificIds?.length ? "sell" : "buy";
    const quote = await getPoolPriceFrom0x(this.params.pool, count, side, slippage, provider);
    return quote;
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    vaultId: s(order.vaultId),
    pool: lc(order.pool),
    collection: lc(order.collection),
    specificIds: order.specificIds ? order.specificIds.map(s) : [],
    amounts: order.amounts ? order.amounts.map(s) : [],
    currency: s(order.currency),
    amount: s(order.amount),
    path: order.path ? order.path.map(s) : [],
    swapCallData: order.swapCallData ?? undefined,
    price: s(order.price),
    extra: {
      prices: order.extra.prices.map(s),
    },
  };
};
