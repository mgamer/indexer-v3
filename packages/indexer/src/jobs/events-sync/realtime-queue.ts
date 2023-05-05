import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { syncEvents } from "@/events-sync/index";
import _, { now } from "lodash";
import cron from "node-cron";

const QUEUE_NAME = "events-sync-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: {
      age: 1,
      count: 1,
    },
    timeout: 45000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (
  config.doBackgroundWork &&
  (_.includes([137, 42161, 10], config.chainId) ? config.doProcessRealtime : true)
) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        const { block } = job.data as { block: number };
        await syncEvents(block);
      } catch (error) {
        logger.error(QUEUE_NAME, `Events realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // Monitor the job as bullmq has bugs and job might be stuck and needs to be manually removed
  cron.schedule(`*/${getNetworkSettings().realtimeSyncFrequencySeconds} * * * * *`, async () => {
    if (_.includes([1, 137, 42161, 10], config.chainId)) {
      const job = await queue.getJob(`${config.chainId}`);

      if (job && (await job.isFailed())) {
        logger.info(QUEUE_NAME, `removing failed job ${job.timestamp} now = ${now()}`);
        await job.remove();
      } else if (job && _.toInteger(job.timestamp) < now() - 45 * 1000) {
        logger.info(QUEUE_NAME, `removing stale job ${job.timestamp} now = ${now()}`);
        await job.remove();
      }
    }
  });
}

export const addToQueue = async () => {
  let jobId;
  if (_.includes([1, 137, 42161, 10], config.chainId)) {
    jobId = `${config.chainId}`;
  }

  await queue.add(randomUUID(), {}, { jobId });
};
