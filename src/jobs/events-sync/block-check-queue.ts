import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { unsyncEvents } from "@/events-sync/index";
import * as backfillEventsSync from "@/jobs/events-sync/backfill-queue";
import * as blocksModel from "@/models/blocks";

const QUEUE_NAME = "events-sync-block-check";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { block } = job.data;

      try {
        const wrongBlocks = new Map<number, string>();

        const upstreamBlockHash = (await baseProvider.getBlock(block)).hash.toLowerCase();

        // Fetch any blocks with a wrong hash from the `blocks` table
        const blocks = await blocksModel.getBlocks(block);
        for (const { number, hash } of blocks) {
          if (hash !== upstreamBlockHash) {
            logger.info(QUEUE_NAME, `Detected wrong block ${number} with hash ${hash}}`);
            wrongBlocks.set(number, hash);
          }
        }

        for (const [block, blockHash] of wrongBlocks.entries()) {
          // Resync the detected orphaned block
          await backfillEventsSync.addToQueue(block, block, {
            prioritized: true,
          });
          await unsyncEvents(block, blockHash);

          // Delete the orphaned block from the `blocks` table
          await blocksModel.deleteBlock(block, blockHash);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Block check failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (block: number, delay: number) =>
  queue.add(`${block}-${delay}`, { block }, { jobId: `${block}-${delay}`, delay });
