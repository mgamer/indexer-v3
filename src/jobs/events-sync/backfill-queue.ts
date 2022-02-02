import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { syncEvents } from "@/events-sync/index";

const QUEUE_NAME = "events-sync-backfill";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock } = job.data;

      try {
        logger.info(
          QUEUE_NAME,
          `Events backfill syncing block range [${fromBlock}, ${toBlock}]`
        );

        await syncEvents(fromBlock, toBlock, true);
      } catch (error) {
        logger.error(QUEUE_NAME, `Events backfill syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    blocksPerBatch?: number;
    prioritized?: boolean;
  }
) => {
  // Syncing is done in several batches since the requested block
  // range might result in lots of events which could potentially
  // not fit within a single provider response.
  const blocksPerBatch = options?.blocksPerBatch ?? 32;

  // Important backfill processes should be prioritized
  const prioritized = options?.prioritized ?? false;

  // Sync in reverse to handle more recent events first
  const jobs: any[] = [];
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: `${from}-${to}`,
      data: {
        fromBlock: from,
        toBlock: to,
      },
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    });
  }

  await queue.addBulk(jobs);
};
