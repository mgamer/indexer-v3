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
        await idb
          .manyOrNone(
            `
            SELECT
              id,
              type,
              active
            FROM takedowns t
          `
          )
          .then((result) =>
            result.map((takedown) => {
              if (takedown.active) {
                Takedowns.add(takedown.type, takedown.id);
              } else {
                Takedowns.delete(takedown.type, takedown.id);
              }
            })
          );
      }
    } catch (error) {
      logger.error("sync-takedowns", `failed to record metrics error ${error}`);
    }
  });
}
