import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { db } from "@/common/db";

const QUEUE_NAME = "events-sync-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { query } = job.data;

      try {
        logger.info(QUEUE_NAME, `Flushing events sync database writes`);

        await db.none(query);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Events sync databsse writes flushing failed: ${error}`
        );
        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      // It's very important to have this queue be single-threaded
      // in order to avoid database write deadlocks (and it can be
      // even better to have it be single-process).
      concurrency: 1,
    }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  query: string,
  options?: {
    blocksPerBatch?: number;
    prioritized?: boolean;
  }
) => {
  // Important write processes should be prioritized
  const prioritized = options?.prioritized ?? false;

  await queue.add(
    uuidv4(),
    { query },
    { priority: prioritized ? 1 : undefined }
  );
};
