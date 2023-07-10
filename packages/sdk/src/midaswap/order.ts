import * as Types from "./types";
import { lc, s } from "../utils";
import Decimal from "decimal.js";

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

  public static binToPriceFixed = (bin: number, decimal = 18, toFixedNumber = 18) => {
    const powValue = bin - 8388608;
    const b = new Decimal(10).pow(18 - decimal);
    const price = new Decimal(1.0001).pow(powValue).times(b).toFixed(toFixedNumber);
    return String(price);
  };
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    pair: lc(order.pair),
    tokenX: lc(order.tokenX),
    tokenId: order.tokenId ? s(order.tokenId) : undefined,
    amount: order.amount ? s(order.amount) : undefined,
    lpTokenId: order.lpTokenId ? s(order.lpTokenId) : undefined,
    extra: {
      prices: order.extra.prices,
    },
  };
};
