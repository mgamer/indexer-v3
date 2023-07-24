import * as Types from "./types";
import { lc, s } from "../utils";
import { ethers } from "ethers";

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
    const b = Math.pow(10, 18 - decimal);
    const price = (Math.pow(1.0001, powValue) * b).toFixed(toFixedNumber);
    return String(price);
  };

  public static getSellPrice = (bin: number, freeRate = 0, royalty = 0) => {
    const price = Order.binToPriceFixed(bin);
    return ethers.utils
      .parseEther((+price * (1 + (freeRate + royalty) / 10000)).toFixed(18).toString())
      .toString();
  };

  public static getBuyPrice = (bin: number, freeRate = 0, royalty = 0) => {
    const price = Order.binToPriceFixed(bin);
    return ethers.utils
      .parseEther((+price / (1 + (freeRate + royalty) / 10000)).toFixed(18).toString())
      .toString();
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
    tokenY: lc(order.tokenY),
    lpTokenId: order.lpTokenId,
    pool: `${lc(order.pair)}_${order.lpTokenId}`,
    tokenId: order.tokenId ? s(order.tokenId) : undefined,
    amount: order.amount ? s(order.amount) : undefined,
    extra: {
      prices: order.extra.prices,
    },
  };
};
