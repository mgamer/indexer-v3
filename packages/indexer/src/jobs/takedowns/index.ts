/* eslint-disable @typescript-eslint/no-explicit-any */

import cron from "node-cron";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { Takedowns } from "@/models/takedowns";

if (config.doBackgroundWork) {
  // Once a day, resync takedown tokens and collections
  cron.schedule("0 0 * * *", async () => {
    try {
      const lock = await acquireLock("sync-takedowns", 60 * 5 - 5);
      if (lock) {
        const takedowns = await idb.manyOrNone(
          `
            SELECT
              id,
              type,
              active
            FROM takedowns t
          `
        );

        Takedowns.addTokens(
          takedowns.filter((t: any) => t.active && t.type === "token").map((t: any) => t.id)
        );
        Takedowns.deleteTokens(
          takedowns.filter((t: any) => !t.active && t.type === "token").map((t: any) => t.id)
        );

        Takedowns.addCollections(
          takedowns.filter((t: any) => t.active && t.type === "collection").map((t: any) => t.id)
        );
        Takedowns.deleteCollections(
          takedowns.filter((t: any) => !t.active && t.type === "collection").map((t: any) => t.id)
        );
      }
    } catch (error) {
      logger.error("sync-takedowns", `failed to record metrics error ${error}`);
    }
  });
}
