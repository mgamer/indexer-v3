import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";

import "@/jobs/arweave-sync/backfill-queue";
import "@/jobs/arweave-sync/realtime-queue";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  // In the same way as we do for syncing events, we poll
  // Arweave periodically to fetch for any new blocks.
  cron.schedule(
    "*/2 * * * *",
    async () =>
      await redlock
        .acquire(["arweave-sync-catchup-lock"], 2 * (60 - 5) * 1000)
        .then(async () => {
          logger.info("arweave-sync-catchup", "Catching up Arweave data");

          try {
            await arweaveSyncRealtime.addToQueue();
          } catch (error) {
            logger.error(
              "arweave-sync-catchup",
              `Failed to catch up Arweave data: ${error}`
            );
          }
        })
        .catch(() => {})
  );
}
