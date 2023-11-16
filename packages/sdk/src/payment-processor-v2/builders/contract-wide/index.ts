import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { s } from "../../../utils";
import { MatchedOrder } from "../../types";

interface BuildParams extends BaseBuildParams {
  beneficiary: string;
}

export class ContractWideBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        trader: order.params.sellerOrBuyer,
        beneficiary: order.params.beneficiary!,
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
      kind: "collection-offer-approval",
      protocol: params.protocol,
      beneficiary: params.beneficiary ?? params.trader,
      marketplace: params.marketplace!,
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator),
      maxRoyaltyFeeNumerator: s(params.maxRoyaltyFeeNumerator),
      sellerOrBuyer: params.trader,
      tokenAddress: params.tokenAddress,
      tokenId: "0",
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
      amount?: BigNumberish;
      tokenId?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    order.params.tokenId = options.tokenId!.toString();
    return order.getMatchedOrder(options.taker, options.amount);
  }
}
