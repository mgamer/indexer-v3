import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { IPart, OrderSide } from "@reservoir0x/sdk/dist/rarible/types";
import { ORDER_DATA_TYPES, ORDER_TYPES } from "@reservoir0x/sdk/dist/rarible/constants";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  tokenId: string;
  quantity: number;
  salt: number;
  currency: string;
  nftAssetClass: string;
  weiPrice: string;
  listingTime: number;
  expirationTime: number;
  signature: string;
  //TODO: Have to refactor the fields below when we come to the create order functionality
  orderType: ORDER_TYPES;
  dataType: ORDER_DATA_TYPES;
  fees: string[];
  originFees?: IPart[];
  payouts?: IPart[];
  originFeeFirst?: IPart;
  originFeeSecond?: IPart;
  marketplaceMarker?: string;
  fee?: number;
  maxFeesBasePoint?: number;

  //Lazy options
  uri?: string;
  supply?: string;
  creators?: IPart[];
  royalties?: IPart[];
  signatures?: string[];
}

type OrderBuildInfo = {
  params: Sdk.Rarible.Types.BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: Sdk.Rarible.Types.OrderSide
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.kind,
        contracts.address
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection
    throw new Error("Could not fetch token collection");
  }

  if (collectionResult.kind !== "erc721" && collectionResult.kind !== "erc1155") {
    throw new Error("Invalid NFT asset class");
  }

  const params: Sdk.Rarible.Types.BaseBuildParams = {
    maker: options.maker,
    side: side === OrderSide.BUY ? "buy" : "sell",
    tokenKind: collectionResult.kind,
    contract: options.contract,
    tokenAmount: options.quantity,
    price: options.weiPrice,
    paymentToken: options.currency,
    startTime: options.listingTime,
    endTime: options.expirationTime,
    orderType: options.orderType,
    dataType: options.dataType,
    originFees: options.originFees,
    payouts: options.payouts,
    originFeeFirst: options.originFeeFirst,
    originFeeSecond: options.originFeeSecond,
    marketplaceMarker: options.marketplaceMarker,
    fee: options.fee,
    maxFeesBasePoint: options.maxFeesBasePoint,
    uri: options.uri,
    supply: options.supply,
    creators: options.creators,
    royalties: options.royalties,
    signatures: options.signatures,
  };
  return {
    params,
  };
};
