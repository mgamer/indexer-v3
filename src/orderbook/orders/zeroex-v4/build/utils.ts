import { BaseBuildParams } from "@reservoir0x/sdk/dist/zeroex-v4/builders/base";

import { edb } from "@/common/db";
import { bn } from "@/common/utils";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  orderbook: "reservoir";
  nonce?: string;
  fee?: number;
  feeRecipient?: string;
  expirationTime?: number;
  automatedRoyalties?: boolean;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo | undefined> => {
  const collectionResult = await edb.oneOrNone(
    `
      SELECT
        contracts.kind,
        collections.royalties
      FROM collections
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
    direction: side,
    contract: options.contract,
    maker: options.maker,
    price: options.weiPrice,
    fees: [],
    amount: collectionResult.kind === "erc1155" ? "1" : undefined,
    expiry: options.expirationTime ? options.expirationTime : undefined,
    nonce: options.nonce,
  };

  if (options.automatedRoyalties) {
    // Include the royalties
    for (const { recipient, bps } of collectionResult.royalties) {
      if (recipient && Number(bps) > 0) {
        buildParams.fees!.push({
          recipient,
          amount: bn(bps).mul(options.weiPrice).div(10000).toString(),
        });
      }
    }
  }

  if (options.fee && options.feeRecipient) {
    buildParams.fees!.push({
      recipient: options.feeRecipient,
      amount: bn(options.fee).mul(options.weiPrice).div(10000).toString(),
    });
  }

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};
