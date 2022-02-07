import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "fill-updates";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
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
      const { buyOrderId, sellOrderId, timestamp } = job.data as FillInfo;

      try {
        let orderId: string | undefined;
        if (buyOrderId === HashZero && sellOrderId !== HashZero) {
          orderId = sellOrderId;
        } else if (sellOrderId === HashZero && buyOrderId !== HashZero) {
          orderId = buyOrderId;
        }

        if (!orderId) {
          // Skip if we can't detect which side was the maker
          return;
        }

        const result = await db.oneOrNone(
          `
            SELECT
              "o"."side",
              "o"."token_set_id",
              "o"."value"
            FROM "orders" "o"
            WHERE "o"."id" = $/orderId/
          `,
          { orderId }
        );

        if (result && result.token_set_id) {
          const components = result.token_set_id.split(":");
          if (components[0] === "token") {
            const [contract, tokenId] = components.slice(1);

            await db.none(
              `
                UPDATE "tokens" SET
                  "last_${result.side}_timestamp" = $/timestamp/,
                  "last_${result.side}_value" = $/value/
                WHERE "contract" = $/contract/
                  AND "token_id" = $/tokenId/
              `,
              {
                contract,
                tokenId,
                timestamp,
                value: result.value,
              }
            );
          } else if (result.side === "buy") {
            await db.none(
              `
                UPDATE "token_sets" SET
                  "last_buy_timestamp" = $/timestamp/,
                  "last_buy_value" = $/value/
                WHERE "id" = $/tokenSetId/
              `,
              {
                tokenSetId: result.token_set_id,
                timestamp,
                value: result.value,
              }
            );
          }

          logger.info(
            QUEUE_NAME,
            `Updated last ${result.side} given token set ${result.token_set_id}`
          );
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle fill info ${job.data}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire([`${QUEUE_NAME}-queue-clean-lock`], (60 - 5) * 1000)
        .then(async () => {
          // Clean up jobs older than 10 minutes
          await queue.clean(10 * 60 * 1000, 10000, "completed");
          await queue.clean(10 * 60 * 1000, 10000, "failed");
        })
        .catch(() => {})
  );
}

export type FillInfo = {
  // Deterministic context that triggered the jobs
  context: string;
  buyOrderId: string;
  sellOrderId: string;
  timestamp: number;
};

export const addToQueue = async (fillInfos: FillInfo[]) => {
  await queue.addBulk(
    fillInfos.map((fillInfo) => ({
      name: `${fillInfo.buyOrderId}-${fillInfo.sellOrderId}`,
      data: fillInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: `${fillInfo.buyOrderId}-${fillInfo.sellOrderId}`,
      },
    }))
  );
};
