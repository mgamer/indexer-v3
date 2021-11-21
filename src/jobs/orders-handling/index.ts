import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db } from "@common/db";
import { logger } from "@common/logger";
import { redis } from "@common/redis";
import { config } from "@config";

const JOB_NAME = "orders_process";

const queue = new Queue(JOB_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(JOB_NAME, { connection: redis });

if (config.doBackgroundWork) {
  // Incoming

  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { orderHash, orderSide, orderStatus } = job.data;

      if (orderSide === "sell") {
        const result = await db.oneOrNone(
          `select "valid_between" from "sell_orders"`
        );
      }
    },
    { connection: redis }
  );
  worker.on("error", (error) => {
    logger.error(JOB_NAME, `Worker errored: ${error}`);
  });
}
