/* eslint-disable @typescript-eslint/no-explicit-any */

import cron from "node-cron";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { Takedowns } from "@/models/takedowns";

export const syncTakedowns = async () => {
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

      await Takedowns.addTokens(
        takedowns.filter((t: any) => t.active && t.type === "token").map((t: any) => t.id)
      );
      await Takedowns.deleteTokens(
        takedowns.filter((t: any) => !t.active && t.type === "token").map((t: any) => t.id)
      );

      await Takedowns.addCollections(
        takedowns.filter((t: any) => t.active && t.type === "collection").map((t: any) => t.id)
      );
      await Takedowns.deleteCollections(
        takedowns.filter((t: any) => !t.active && t.type === "collection").map((t: any) => t.id)
      );

      logger.info("sync-takedowns", `synced ${takedowns.length} takedowns`);
    }
  } catch (error) {
    logger.error("sync-takedowns", `failed to sync takedowns error ${error}`);
  }
};

if (config.doBackgroundWork) {
  // Once a day, resync takedown tokens and collections
  cron.schedule("0 0 * * *", async () => {
    syncTakedowns();
  });
}
