import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

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
      const { kind, info } = job.data as GenericOrderInfo;

      try {
        switch (kind) {
          case "wyvern-v2.3": {
            await orders.wyvernV23.save([info as orders.wyvernV23.OrderInfo]);
            break;
          }
        }
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

export type GenericOrderInfo = {
  kind: "wyvern-v2.3";
  info: orders.wyvernV23.OrderInfo;
};

export const addToQueue = async (orderInfos: GenericOrderInfo[]) => {
  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: uuidv4(),
      data: orderInfo,
    }))
  );
};
