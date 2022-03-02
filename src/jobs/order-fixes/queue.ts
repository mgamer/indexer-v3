import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "order-fixes";

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
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, side, continuation } = job.data as OrderFixInfo;

      try {
        if (kind === "balance" && side === "sell") {
          // We should make sure the `orders` table has the right index

          const limit = 1000;
          const result = await db.oneOrNone(
            `
              WITH "x" AS (
                SELECT
                  "o"."id",
                  "o"."maker",
                  "o"."fillability_status",
                  (
                    CASE WHEN "nb"."amount" > 0
                      THEN 'fillable'
                      ELSE 'no-balance'
                    END
                  )::order_fillability_status_t AS "correct_fillability_status"
                FROM "orders" "o"
                JOIN "token_sets_tokens" "tst"
                  ON "o"."token_set_id" = "tst"."token_set_id"
                LEFT JOIN "nft_balances" "nb"
                  ON "tst"."contract" = "nb"."contract"
                  AND "tst"."token_id" = "nb"."token_id"
                  AND "o"."maker" = "nb"."owner"
                WHERE "o"."side" = 'sell'
                  AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                  AND "o"."id" > $/continuation/
                ORDER BY "o"."id"
                LIMIT ${limit}
              ),
              "y" AS (
                UPDATE "orders" AS "o" SET
                  "fillability_status" = "x"."correct_fillability_status"
                FROM "x"
                WHERE "o"."fillability_status" != "x"."correct_fillability_status"
                  AND "o"."id" = "x"."id"
                RETURNING "o"."id"
              )
              SELECT
                (SELECT array_agg("y"."id") FROM "y") AS "order_ids",
                COUNT(*) AS "count",
                MAX("x"."id") AS "continuation"
              FROM "x"
            `,
            { continuation: continuation || HashZero }
          );

          if (result) {
            // Update any wrong caches
            const orderIds: string[] = result.order_ids || [];
            await orderUpdatesById.addToQueue(
              orderIds.map(
                (id) =>
                  ({
                    context: `revalidation-${Date.now()}-${id}`,
                    id,
                    trigger: {
                      kind: "revalidation",
                    },
                  } as orderUpdatesById.OrderInfo)
              )
            );

            // Trigger the next job if we still have orders to process
            const count = Number(result.count);
            if (count === limit) {
              await addToQueue([
                { kind, side, continuation: result.continuation },
              ]);
            }
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order fix info ${JSON.stringify(
            job.data
          )}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderFixInfo = {
  kind: "balance";
  side: "sell";
  continuation?: string;
};

export const addToQueue = async (orderFixInfos: OrderFixInfo[]) => {
  await queue.addBulk(
    orderFixInfos.map((orderFixInfo) => ({
      name: randomUUID(),
      data: orderFixInfo,
    }))
  );
};
