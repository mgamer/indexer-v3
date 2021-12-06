import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { db } from "@/common/db";

// Every once in a while (eg. 5 minutes) update aggregated
// statistics per collection. These are computationally
// heavy so we cache the results instead of having to redo
// the queries every time we need the results (and we need
// them quite often in the collections APIs).

if (config.doBackgroundWork) {
  cron.schedule("*/5 * * * *", async () => {
    const lockAcquired = await acquireLock("collection_stats_update_lock", 295);
    if (lockAcquired) {
      logger.info("collection_stats_update_cron", "Updating collection stats");

      try {
        await db.none(`refresh materialized view "collection_stats"`);
      } catch (error) {
        logger.error(
          "collection_stats_update_cron",
          `Failed to update collection stats: ${error}`
        );
      }
    }
  });
}
