import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { OrderSide } from "@reservoir0x/sdk/dist/universe/types";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  tokenId: string;
  amount: number;
  salt: number;
  priceContract: string;
  nftAssetClass: string;
  weiPrice: string;
  start: number;
  end: number;
  signature: string;
  revenueSplits: Sdk.Universe.Types.IPart[];
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

  if (options.nftAssetClass !== "erc721" && options.nftAssetClass !== "erc1155") {
    throw new Error("Invalid NFT asset class");
  }

  const params: Sdk.Universe.Types.BaseBuildParams = {
    maker: options.maker,
    side: side === OrderSide.BUY ? "buy" : "sell",
    tokenKind: options.nftAssetClass,
    contract: options.contract,
    tokenId: options.tokenId,
    tokenAmount: options.amount,
    price: options.weiPrice,
    paymentToken: options.priceContract,
    fees: options.revenueSplits,
    salt: options.salt,
    startTime: options.start,
    endTime: options.end,
    signature: options.signature,
  };
  return {
    params,
  };
};
