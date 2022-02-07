import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";

import { syncArweave } from "@/arweave-sync/index";
import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "arweave-sync-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      try {
        let localBlock = Number(await redis.get(`${QUEUE_NAME}-min-block`));
        if (localBlock === 0) {
          localBlock = (await arweaveGateway.blocks.getCurrent()).height;
          await redis.set(`${QUEUE_NAME}-min-block`, localBlock);
        }

        const localCursor = await redis.get(`${QUEUE_NAME}-after-cursor`);

        let { lastCursor, done } = await syncArweave({
          fromBlock: localBlock,
          afterCursor: localCursor ?? undefined,
        });
        while (!done) {
          ({ lastCursor, done } = await syncArweave({
            fromBlock: localBlock,
            afterCursor: lastCursor,
          }));
        }

        if (lastCursor) {
          await redis.set(`${QUEUE_NAME}-after-cursor`, lastCursor);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Arweave realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(uuidv4(), {});
};
