import cron from "node-cron";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { collectionSlugFlugStatusSyncJob } from "./collection-slug-flag-status";
import { contractFlugStatusSyncJob } from "./contract-flag-status";
import { logger } from "@/common/logger";

if (config.doBackgroundWork && !config.disableFlagStatusRefreshJob) {
  cron.schedule(
    // Every second
    "*/1 * * * * *",
    async () =>
      await redlock
        .acquire(["flag-status-sync-cron"], (10 * 60 - 3) * 1000)
        .then(async () => {
          await tokenFlagStatusSyncJob.addToQueue();

          await collectionSlugFlugStatusSyncJob.addToQueue();

          await contractFlugStatusSyncJob.addToQueue();
        })
        .catch((error) => {
          logger.error("flag-status-sync-cron", `Error: ${error}`);
        })
  );
}
