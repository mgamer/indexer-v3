import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/seaport/builders/base";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/seaport/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  try {
    const collectionResult = await edb.oneOrNone(
      `
        SELECT "t"."collection_id" FROM "tokens" "t"
        WHERE "t"."contract" = $/contract/
          AND "t"."token_id" = $/tokenId/
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
      // Skip if we cannot generate the build information
      return undefined;
    }

    const builder: BaseBuilder = new Sdk.Seaport.Builders.SingleToken(config.chainId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenId = options.tokenId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).amount = options.quantity;

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("seaport-build-sell-token-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
