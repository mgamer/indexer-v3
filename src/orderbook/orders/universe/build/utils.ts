import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { OrderSide } from "@reservoir0x/sdk/dist/universe/types";

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
  fees: Sdk.Universe.Types.IPart[];
}

type OrderBuildInfo = {
  params: Sdk.Universe.Types.BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: Sdk.Universe.Types.OrderSide
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

  const params: Sdk.Universe.Types.BaseBuildParams = {
    maker: options.maker,
    side: side === OrderSide.BUY ? "buy" : "sell",
    tokenKind: collectionResult.kind,
    contract: options.contract,
    tokenId: options.tokenId,
    tokenAmount: options.quantity,
    price: options.weiPrice,
    paymentToken: options.currency,
    fees: options.fees,
    startTime: options.listingTime,
    endTime: options.expirationTime,
  };
  return {
    params,
  };
};
