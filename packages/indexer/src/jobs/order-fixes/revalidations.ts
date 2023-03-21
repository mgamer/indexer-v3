import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "order-revalidations";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
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
      const { id, status } = job.data as OrderRevalidationInfo;

      try {
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = '${status === "active" ? "fillable" : "cancelled"}',
              approval_status = '${status === "active" ? "approved" : "disabled"}',
              updated_at = now()
            WHERE orders.id = $/id/
          `,
          { id }
        );

        // Recheck the order
        await orderUpdatesById.addToQueue([
          {
            context: `revalidation-${Date.now()}-${id}`,
            id,
            trigger: {
              kind: "revalidation",
            },
          } as orderUpdatesById.OrderInfo,
        ]);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order revalidation info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderRevalidationInfo = {
  id: string;
  status: "active" | "inactive";
};

export const addToQueue = async (orderRevalidationInfos: OrderRevalidationInfo[]) => {
  await queue.addBulk(
    orderRevalidationInfos.map((orderRevalidationInfo) => ({
      name: randomUUID(),
      data: orderRevalidationInfo,
    }))
  );
};
