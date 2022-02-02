import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import * as realtimeEventsSync from "@/jobs/events-sync/realtime-queue";

// For syncing events we have two separate job queues. One is for
// handling backfilling of past event while the other one handles
// realtime syncing of events. The reason for having these two be
// separated is that we don't want any ongoing backfilling action
// to delay realtime syncing (which tries to catch up to the head
// of the blockchain). Apart from these, we also have several job
// queues (that are single-threaded) which act as writing buffers
// for queries that are prone to database deadlocks (these are ft
// and nft transfer events writes which can run into deadlocks on
// concurrent upserts of the balances):
// https://stackoverflow.com/questions/46366324/postgres-deadlocks-on-concurrent-upserts

import "@/jobs/events-sync/backfill-queue";
import "@/jobs/events-sync/realtime-queue";
import "@/jobs/events-sync/ft-transfers-write-queue";
import "@/jobs/events-sync/nft-transfers-write-queue";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  cron.schedule("*/15 * * * * *", async () => {
    const lockAcquired = await acquireLock("events-sync-catchup-lock", 10);
    if (lockAcquired) {
      logger.info("events-sync-catchup", "Catching up events");

      try {
        await realtimeEventsSync.addToQueue();
      } catch (error) {
        logger.error(
          "events-sync-catchup",
          `Failed to catch up events: ${error}`
        );
      }
    }
  });
}
