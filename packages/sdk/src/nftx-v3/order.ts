import { Provider } from "@ethersproject/abstract-provider";

import { getPoolPriceFromAPI } from "./helpers";
import * as Types from "./types";
import { lc, s } from "../utils";

export class Order {
  public chainId: number;
  public vault: string;
  public userAddress: string;
  public params: Types.OrderParams;

  constructor(chainId: number, vault: string, userAddress: string, params: Types.OrderParams) {
    this.chainId = chainId;
    this.vault = vault;
    this.userAddress = userAddress;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  async getQuote(slippage: number, provider: Provider) {
    const side = this.params.idsOut?.length ? "buy" : "sell";
    return getPoolPriceFromAPI(
      this.vault,
      side,
      slippage,
      provider,
      this.userAddress,
      side === "buy" ? this.params.idsOut! : this.params.idsIn!,
      this.params.amounts
    );
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    vaultId: s(order.vaultId),
    collection: lc(order.collection),
    idsIn: order.idsIn ? order.idsIn.map(s) : [],
    idsOut: order.idsOut ? order.idsOut.map(s) : [],
    amounts: order.amounts ? order.amounts.map(s) : [],
    currency: s(order.currency),
    executeCallData: lc(order.executeCallData),
    deductRoyalty: order.deductRoyalty,
    vTokenPremiumLimit: s(order.vTokenPremiumLimit),
    price: s(order.price),
  };
};
