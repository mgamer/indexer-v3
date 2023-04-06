// import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
// import * as Addresses from "../../addresses";
import { Order } from "../../order";
import { BytesEmpty, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
      });

      if (!copyOrder) {
        return false;
      }

      if (copyOrder.hash() !== order.hash()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: BuildParams) {
    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: "single-token",

      signer: params.signer,
      collection: params.collection,
      price: s(params.price),
      itemIds: params.itemIds.map((c) => s(c)),
      amounts: params.amounts.map((c) => s(c)),
      strategyId: 0,
      currency: params.currency,
      quoteType: params.quoteType,
      collectionType: params.collectionType,

      startTime: params.startTime!,
      endTime: params.endTime!,
      additionalParameters: params.additionalParameters ?? BytesEmpty,

      globalNonce: params.globalNonce ? s(params.globalNonce) : "0",
      subsetNonce: params.subsetNonce ? s(params.subsetNonce) : "0",
      orderNonce: params.orderNonce ? s(params.orderNonce) : "0",

      signature: params.signature,
    });
  }

  public buildMatching(order: Order, recipient: string) {
    return {
      recipient,
      additionalParameters: BytesEmpty,
    };
  }
}
