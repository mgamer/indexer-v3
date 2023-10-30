import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { MatchedOrder } from "../../types";
import { Order } from "../../order";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
  beneficiary?: string;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        trader: order.params.sellerOrBuyer,
        tokenId: order.params.tokenId!,
        beneficiary: order.params.beneficiary ?? undefined,
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
      kind: params.beneficiary ? "item-offer-approval" : "sale-approval",
      protocol: params.protocol,
      marketplace: params.marketplace ?? AddressZero,
      beneficiary: params.beneficiary ?? undefined,
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator) ?? "0",
      maxRoyaltyFeeNumerator: s(params.maxRoyaltyFeeNumerator) ?? "0",
      sellerOrBuyer: params.trader,
      tokenAddress: params.tokenAddress,
      tokenId: s(params.tokenId),
      amount: s(params.amount),
      price: s(params.price),
      expiration: s(params.expiration),
      nonce: s(params.nonce),
      paymentMethod: params.paymentMethod,
      masterNonce: s(params.masterNonce),
      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    order: Order,
    options: {
      taker: string;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    return order.getMatchedOrder(options.taker);
  }
}
