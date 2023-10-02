import cron from "node-cron";
import { acquireLock, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { collectionFlagStatusSyncJob } from "@/jobs/flag-status/collection-flag-status-sync-job";
import { PendingFlagStatusSyncCollections } from "@/models/pending-flag-status-sync-collections";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";

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
            const tokens = await PendingFlagStatusSyncTokens.get(20);
            await tokenFlagStatusSyncJob.addToQueue({
              tokens,
            });
          }

          // check if we can acquire the lock for collections
          if (await acquireLock(collectionFlagStatusSyncJob.getLockName(), 60)) {
            const collection = await PendingFlagStatusSyncCollections.get(1);
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
