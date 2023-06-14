import { lc, s } from "../utils";
import * as Types from "./types";

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
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    pool: lc(order.pool),
    collection: lc(order.collection),
    tokenIds: order.tokenIds ? order.tokenIds.map(s) : [],
    deadline: s(order.deadline),
    baseTokenAmount: s(order.baseTokenAmount),
    proofs: order.proofs ? order.proofs.map((proof) => proof.map(s)) : [],
    stolenProofs: order.stolenProofs
      ? order.stolenProofs.map((proof) => ({
          id: s(proof.id),
          payload: s(proof.payload),
          timestamp: s(proof.timestamp),
          signature: s(proof.signature),
        }))
      : [],
    isBuy: order.isBuy,
  };
};
