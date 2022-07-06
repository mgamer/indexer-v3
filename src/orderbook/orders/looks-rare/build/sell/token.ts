import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/looks-rare/builders/base";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/looks-rare/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  try {
    const collectionResult = await redb.oneOrNone(
      `
        SELECT
          tokens.collection_id
        FROM tokens
        WHERE tokens.contract = $/contract/
          AND tokens.token_id = $/tokenId/
      `,
      {
        contract: toBuffer(options.contract),
        tokenId: options.tokenId,
      }
    );

    if (!collectionResult) {
      // Skip if we cannot retrieve the token's collection
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "sell");
    if (!buildInfo) {
      // Skip if we cannot generate the build information.
      return undefined;
    }

    const builder: BaseBuilder = new Sdk.LooksRare.Builders.SingleToken(config.chainId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenId = options.tokenId;

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("looks-rare-build-sell-token-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
