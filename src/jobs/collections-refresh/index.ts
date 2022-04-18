import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && 1 + 1 === 3) {
  cron.schedule(
    "30 23 * * *",
    async () =>
      await redlock
        .acquire(["daily-collections-metadata-refresh"], 5000)
        .then(async () => {
          logger.info("daily-collections-refresh", "Starting refresh collections metadata");

          try {
            await collectionsRefresh.addToQueue();
          } catch (error) {
            logger.error("daily-collections-refresh", `Failed to refresh: ${error}`);
          }
        })
        .catch((e) => {
          logger.error(
            "daily-volumes",
            JSON.stringify({
              msg: e.message,
            })
          );
        })
  );
}
