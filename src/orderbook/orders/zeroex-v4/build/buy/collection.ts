import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/zeroex-v4/builders/base";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/zeroex-v4/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  try {
    const collectionResult = await edb.oneOrNone(
      `
        SELECT
          collections.token_set_id,
          collections.token_count,
          collections.contract
        FROM collections
        WHERE collections.id = $/collection/
      `,
      { collection: options.collection }
    );
    if (!collectionResult) {
      // Skip if we cannot retrieve the collection.
      return undefined;
    }

    if (Number(collectionResult.token_count) > config.maxItemsPerBid) {
      // We don't support collection orders on large collections.
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(
      {
        ...options,
        contract: fromBuffer(collectionResult.contract),
      },
      options.collection,
      "buy"
    );
    if (!buildInfo) {
      // Skip if we cannot generate the build information.
      return undefined;
    }

    let builder: BaseBuilder | undefined;
    if (buildInfo.kind === "erc721") {
      builder = collectionResult.token_set_id.startsWith("contract:")
        ? new Sdk.ZeroExV4.Builders.ContractWide(config.chainId)
        : new Sdk.ZeroExV4.Builders.TokenRange(config.chainId);
    } else if (buildInfo.kind === "erc1155") {
      builder = collectionResult.token_set_id.startsWith("contract:")
        ? new Sdk.ZeroExV4.Builders.ContractWide(config.chainId)
        : new Sdk.ZeroExV4.Builders.TokenRange(config.chainId);
    }

    if (!collectionResult.token_set_id.startsWith("contract:")) {
      const [, , startTokenId, endTokenId] = collectionResult.token_set_id.split(":");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (buildInfo.params as any).startTokenId = startTokenId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (buildInfo.params as any).endTokenId = endTokenId;
    }

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("zeroex-v4-build-buy-collection-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
