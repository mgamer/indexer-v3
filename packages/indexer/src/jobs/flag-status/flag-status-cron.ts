import cron from "node-cron";
import { acquireLock, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { PendingFlagStatusRefreshTokens } from "@/models/pending-flag-status-refresh-tokens";
import { collectionFlagStatusSyncJob } from "@/jobs/flag-status/collection-flag-status-sync-job";
import { PendingRefreshCollections } from "@/models/pending-flag-status-sync-collections";

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 5 seconds
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["flag-status-sync-cron"], (10 * 60 - 3) * 1000)
        .then(async () => {
          // check if we can acquire the lock for tokens
          if (await acquireLock(tokenFlagStatusSyncJob.getLockName(), 60)) {
            // get up to 20 tokens from the queue
            const tokens = await PendingFlagStatusRefreshTokens.get(20);
            await tokenFlagStatusSyncJob.addToQueue({
              tokens,
            });
          }

          // check if we can acquire the lock for collections
          if (await acquireLock(collectionFlagStatusSyncJob.getLockName(), 60)) {
            const collection = await PendingRefreshCollections.get();
            await collectionFlagStatusSyncJob.addToQueue({
              ...collection[0],
            });
          }
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
