import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { unsyncEvents } from "@/events-sync/index";
import * as backfillEventsSync from "@/jobs/events-sync/backfill-queue";
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
import "@/jobs/events-sync/write-buffers/ft-transfers";
import "@/jobs/events-sync/write-buffers/nft-transfers";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  // Keep up with the head of the blockchain by polling for new blocks
  // every once in a while (hardcoded at 15 seconds for now but should
  // be set dynamically depending on the chain's average block time).
  cron.schedule(
    "*/15 * * * * *",
    async () =>
      await redlock
        .acquire(["events-sync-catchup-lock"], (15 - 5) * 1000)
        .then(async () => {
          logger.info("events-sync-catchup", "Catching up events");

          try {
            await realtimeEventsSync.addToQueue();
          } catch (error) {
            logger.error(
              "events-sync-catchup",
              `Failed to catch up events: ${error}`
            );
          }
        })
        .catch(() => {})
  );

  // Since we're polling up to the latest block of the chain, we have
  // to ensure we have don't persist orphaned blocks. Every once in a
  // while, we have to check the latest blocks and make sure they are
  // still in the canonical chain.
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire(["events-sync-orphan-check-lock"], (60 - 5) * 1000)
        .then(async () => {
          logger.info("events-sync-orphan-check", "Checking orphaned blocks");

          try {
            // Fetch last local blocks
            const blocksInfo: { block: number; block_hash: Buffer }[] =
              // TODO: Investigate the best index to use for retrieving
              // the latest distinct block hashes (so that we don't get
              // slow writes/updates - especially when backfilling).
              await db.manyOrNone(
                `
                  (
                    SELECT DISTINCT "block", "block_hash"
                    FROM "nft_transfer_events"
                    ORDER BY "block" DESC
                    LIMIT 30
                  )
                  UNION
                  (
                    SELECT DISTINCT "block", "block_hash"
                    FROM "ft_transfer_events"
                    ORDER BY "block" DESC
                    LIMIT 30
                  )
                  UNION
                  (
                    SELECT DISTINCT "block", "block_hash"
                    FROM "cancel_events"
                    ORDER BY "block" DESC
                    LIMIT 30
                  )
                  UNION
                  (
                    SELECT DISTINCT "block", "block_hash"
                    FROM "fill_events_2"
                    ORDER BY "block" DESC
                    LIMIT 30
                  )
                  UNION
                  (
                    SELECT DISTINCT "block", "block_hash"
                    FROM "fill_events"
                    ORDER BY "block" DESC
                    LIMIT 30
                  )
                `,
                { limit: 30 }
              );

            // Check orphaned blocks by comparing the local block
            // hash against the latest upstream block hash
            const wrongBlocks = new Map<number, string>();
            try {
              for (const { block, block_hash } of blocksInfo) {
                const upstreamBlockHash = (await baseProvider.getBlock(block))
                  .hash;
                const localBlockHash = fromBuffer(block_hash);
                if (localBlockHash !== upstreamBlockHash) {
                  wrongBlocks.set(block, localBlockHash);

                  logger.info(
                    "events-sync-orphan-check",
                    `Detected wrong block ${block} with hash ${localBlockHash}}`
                  );
                }
              }
            } catch (error) {
              logger.error(
                "events-sync-orphan-check",
                `Failed to retrieve block hashes: ${error}`
              );
            }

            // Fix any orphaned blocks
            for (const [block, blockHash] of wrongBlocks.entries()) {
              await backfillEventsSync.addToQueue(block, block, {
                prioritized: true,
              });
              await unsyncEvents(blockHash);
            }
          } catch (error) {
            logger.error(
              "events-sync-orphan-check",
              `Failed to checking/fixing orphaned blocks: ${error}`
            );
          }
        })
        .catch(() => {})
  );
}
