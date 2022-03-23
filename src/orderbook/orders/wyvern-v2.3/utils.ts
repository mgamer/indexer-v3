import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export const getUserProxy = async (owner: string): Promise<string | undefined> => {
  try {
    // First, try to get the user proxy from the local database
    let proxy = await idb
      .oneOrNone(
        `
          SELECT "wp"."proxy" FROM "wyvern_proxies" "wp"
          WHERE "wp"."owner" = $/owner/
        `,
        { owner: toBuffer(owner) }
      )
      .then((r) => (r ? fromBuffer(r.proxy) : undefined));

    if (!proxy) {
      // If that doesn't work out, then query the user proxy on-chain
      proxy = await new Sdk.WyvernV23.Helpers.ProxyRegistry(baseProvider, config.chainId)
        .getProxy(owner)
        .then((p) => p.toLowerCase());

      if (!proxy || proxy === AddressZero) {
        // The user has no associated proxy or we failed to fetch it
        return undefined;
      }

      // Cache the proxy in the local database
      await idb.none(
        `
          INSERT INTO "wyvern_proxies"(
            "owner",
            "proxy"
          )
          VALUES ($/owner/, $/proxy/)
          ON CONFLICT DO NOTHING
        `,
        {
          owner: toBuffer(owner),
          proxy: toBuffer(proxy),
        }
      );
    }

    return proxy;
  } catch (error) {
    logger.error("wyvern-v2.3-get-user-proxy", `Failed to get user proxy: ${error}`);
    return undefined;
  }
};
