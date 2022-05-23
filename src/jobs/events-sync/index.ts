import cron from "node-cron";

import { logger } from "@/common/logger";
import { baseProvider, safeWebSocketSubscription } from "@/common/provider";
import { redlock, redis } from "@/common/redis";
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
import "@/jobs/events-sync/block-check-queue";
import "@/jobs/events-sync/realtime-queue";
import "@/jobs/events-sync/write-buffers/ft-transfers";
import "@/jobs/events-sync/write-buffers/nft-transfers";

const LATEST_BLOCKS_CACHE_KEY = "events-sync-latest-blocks";

export const saveLatestBlocks = async (blockInfos: { block: number; hash: string }[]) => {
  try {
    for (const { block, hash } of blockInfos) {
      // Use a sorted set scored by the negated block number
      // so that the latest blocks are prioritized.
      await redis.zadd(LATEST_BLOCKS_CACHE_KEY, -block, hash);
    }

    // Get the latest block number
    const result = await redis.zrange(LATEST_BLOCKS_CACHE_KEY, 0, 0, "WITHSCORES");
    if (result.length) {
      // Only keep the latest 100 blocks
      const latestBlockNegated = Number(result[1]);
      await redis.zremrangebyscore(LATEST_BLOCKS_CACHE_KEY, latestBlockNegated + 100, "+inf");
    }
  } catch (error) {
    logger.error("events-sync-save-latest-blocks", `Failed to save latest blocks: ${error}`);
  }
};

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
            logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // Since we're polling up to the latest block of the chain, we have
  // to ensure we have don't persist orphaned blocks. Every once in a
  // while, we have to check the latest blocks and make sure they are
  // still in the canonical chain.
  cron.schedule(
    "*/30 * * * * *",
    async () =>
      await redlock
        .acquire(["events-sync-orphan-check-lock"], (30 - 5) * 1000)
        .then(async () => {
          logger.info("events-sync-orphan-check", "Checking orphaned blocks");

          try {
            // Check orphaned blocks by comparing the local block
            // hash against the latest upstream block hash
            const wrongBlocks = new Map<number, string>();
            try {
              const blockInfos = await redis.zrange(LATEST_BLOCKS_CACHE_KEY, 0, 100, "WITHSCORES");
              for (let i = 0; i < blockInfos.length; i += 2) {
                const blockHash = blockInfos[i];
                const block = -Number(blockInfos[i + 1]);

                const upstreamBlockHash = (await baseProvider.getBlock(block)).hash;
                if (blockHash !== upstreamBlockHash) {
                  wrongBlocks.set(block, blockHash);

                  logger.info(
                    "events-sync-orphan-check",
                    `Detected wrong block ${block} with hash ${blockHash}}`
                  );
                }
              }
            } catch (error) {
              logger.error("events-sync-orphan-check", `Failed to retrieve block hashes: ${error}`);
            }

            // Fix any orphaned blocks
            for (const [block, blockHash] of wrongBlocks.entries()) {
              await backfillEventsSync.addToQueue(block, block, {
                prioritized: true,
              });
              await unsyncEvents(block, blockHash);

              // Remove the fixed block from the cached latest blocks
              await redis.zrem(LATEST_BLOCKS_CACHE_KEY, blockHash);
            }
          } catch (error) {
            logger.error(
              "events-sync-orphan-check",
              `Failed to checking/fixing orphaned blocks: ${error}`
            );
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // ONLY MASTER
  if (config.master) {
    // Besides the manual polling of events via the above cron job
    // we're also integrating WebSocket subscriptions to fetch the
    // latest events as soon as they're hapenning on-chain. We are
    // still keeping the manual polling though to ensure no events
    // are being missed.
    safeWebSocketSubscription(async (provider) => {
      provider.on("block", async (block) => {
        logger.info("events-sync-catchup", `Detected new block ${block}`);

        try {
          await realtimeEventsSync.addToQueue();
        } catch (error) {
          logger.error("events-sync-catchup", `Failed to catch up events: ${error}`);
        }
      });
    });
  }
}
