import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as wyvernV2 from "@/orderbook/orders/wyvern-v2/index";

const QUEUE_NAME = "orderbook-orders-queue";

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
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderParams, metadata } = job.data as wyvernV2.OrderInfo;

      try {
        await wyvernV2.save([{ orderParams, metadata }]);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process order ${job.data}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (orderInfos: wyvernV2.OrderInfo[]) => {
  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: `${orderInfo.orderParams.maker}-${orderInfo.orderParams.salt}`,
      data: orderInfo,
    }))
  );
};
