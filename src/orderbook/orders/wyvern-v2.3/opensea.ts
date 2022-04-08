/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export const parseOpenSeaOrder = async (
  openSeaOrder: any
): Promise<Sdk.WyvernV23.Order | undefined> => {
  try {
    const order = new Sdk.WyvernV23.Order(config.chainId, {
      exchange: openSeaOrder.exchange,
      maker: openSeaOrder.maker.address,
      taker: openSeaOrder.taker.address,
      makerRelayerFee: Number(openSeaOrder.maker_relayer_fee),
      takerRelayerFee: Number(openSeaOrder.taker_relayer_fee),
      feeRecipient: openSeaOrder.fee_recipient.address,
      side: openSeaOrder.side,
      saleKind: openSeaOrder.sale_kind,
      target: openSeaOrder.target,
      howToCall: openSeaOrder.how_to_call,
      calldata: openSeaOrder.calldata,
      replacementPattern: openSeaOrder.replacement_pattern,
      staticTarget: openSeaOrder.static_target,
      staticExtradata: openSeaOrder.static_extradata,
      paymentToken: openSeaOrder.payment_token,
      basePrice: openSeaOrder.base_price,
      extra: openSeaOrder.extra,
      listingTime: openSeaOrder.listing_time,
      expirationTime: openSeaOrder.expiration_time,
      salt: openSeaOrder.salt,
      nonce: String(await commonHelpers.getMinNonce("wyvern-v2.3", openSeaOrder.maker.address)),
      v: openSeaOrder.v,
      r: openSeaOrder.r,
      s: openSeaOrder.s,
    });

    if (order.prefixHash() === openSeaOrder.prefixed_hash) {
      order.checkValidity();
      order.checkSignature();
      return order;
    }
  } catch {
    return undefined;
  }

  return undefined;
};
