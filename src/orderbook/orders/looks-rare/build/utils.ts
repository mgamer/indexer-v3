import { BaseBuildParams } from "@reservoir0x/sdk/dist/looks-rare/builders/base";

import { edb } from "@/common/db";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  nonce?: string;
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
): Promise<OrderBuildInfo | undefined> => {
  const collectionResult = await edb.oneOrNone(
    `
      SELECT 1 FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection.
    return undefined;
  }

  const buildParams: BaseBuildParams = {
    isOrderAsk: side === "sell",
    collection: options.contract,
    signer: options.maker,
    price: options.weiPrice,
    nonce: options.nonce,
    startTime: options.listingTime,
    endTime: options.expirationTime,
  };

  return {
    params: buildParams,
  };
};
