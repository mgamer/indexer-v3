import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/looks-rare/builders/base";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/looks-rare/build/utils";

export const build = async (options: utils.BaseOrderBuildOptions) => {
  try {
    const collectionResult = await redb.oneOrNone(
      `
        SELECT
          collections.id
        FROM collections
        WHERE collections.id = $/id/
      `,
      {
        collection: options.contract,
      }
    );
    if (!collectionResult || collectionResult.id.includes(":")) {
      // Skip if we cannot retrieve the collection or if the
      // collection is not supported (eg. range or list).
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(options, options.contract, "buy");
    if (!buildInfo) {
      // Skip if we cannot generate the build information.
      return undefined;
    }

    const builder: BaseBuilder = new Sdk.LooksRare.Builders.ContractWide(config.chainId);

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("looks-rare-build-buy-collection-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
