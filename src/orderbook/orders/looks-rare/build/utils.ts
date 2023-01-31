import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/looks-rare/builders/base";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  listingTime?: number;
  expirationTime?: number;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
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

  const buildParams: BaseBuildParams = {
    isOrderAsk: side === "sell",
    collection: fromBuffer(collectionResult.address),
    signer: options.maker,
    // Protocol fee (1.5%) + optional fixed royalties (0.5%)
    minPercentageToAsk: 9800,
    price: options.weiPrice,
    // LooksRare uses WETH instead of ETH for sell orders too
    currency: Sdk.Common.Addresses.Weth[config.chainId],
    startTime: options.listingTime,
    endTime: options.expirationTime,
  };

  return {
    params: buildParams,
  };
};
