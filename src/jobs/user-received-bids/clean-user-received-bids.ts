/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { UserReceivedBids } from "@/models/user-received-bids";

const QUEUE_NAME = "clean-user-received-bids-queue";

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
      const limit = 5000;
      const deletedBidsCount = await UserReceivedBids.cleanBids(limit);
      logger.info(QUEUE_NAME, `Deleted ${deletedBidsCount} bids`);

      if (deletedBidsCount == limit) {
        job.data.moreToDelete = true;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job: Job) => {
    if (job.data.moreToDelete) {
      await addToQueue();
    } else {
      await releaseLock("clean-user-received-bids");
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
