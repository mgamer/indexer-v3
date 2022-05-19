/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "collections-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract } = job.data;

      if (await acquireLock(QUEUE_NAME, 1)) {
        logger.info(QUEUE_NAME, `Refresh collection metadata=${contract}`);
        await Collections.updateCollectionCache(contract, "1");
      } else {
        await addToQueue(contract, 1000);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, delay = 0) => {
  await queue.add(randomUUID(), { contract }, { delay });
};
