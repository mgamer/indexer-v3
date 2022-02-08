import { AddressZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "order-updates-by-maker";

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
      const { context, timestamp, side, maker, contract, tokenId } =
        job.data as MakerInfo;

      try {
        // TODO: Handle the order's approval status as well

        let fillabilityStatuses: {
          id: string;
          old_status: string;
          new_status: string;
          expiration: string | null;
        }[] = [];

        if (side === "buy") {
          fillabilityStatuses = await db.manyOrNone(
            `
              SELECT
                "o"."id",
                "o"."fillability_status" AS "old_status",
                (CASE
                  WHEN "fb"."amount" >= "o"."price" THEN 'fillable'
                  ELSE 'no-balance'
                END)::order_fillability_status_t AS "new_status",
                (CASE
                  WHEN "fb"."amount" >= "o"."price" THEN upper("o"."valid_between")
                  ELSE to_timestamp($/timestamp/)
                END) AS "expiration"
              FROM "orders" "o"
              JOIN "ft_balances" "fb"
                ON "o"."maker" = "fb"."owner"
              WHERE "o"."maker" = $/maker/
                AND "o"."side" = 'buy'
                AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                AND "fb"."contract" = $/contract/
            `,
            {
              maker,
              contract,
              timestamp,
            }
          );
        } else if (side === "sell") {
          fillabilityStatuses = await db.manyOrNone(
            `
              SELECT
                "o"."id",
                "o"."fillability_status" AS "old_status",
                (CASE
                  WHEN "nb"."amount" > 0 THEN 'fillable'
                  ELSE 'no-balance'
                END)::order_fillability_status_t AS "new_status",
                (CASE
                  WHEN "nb"."amount" > 0 THEN upper("o"."valid_between")
                  ELSE to_timestamp($/timestamp/)
                END) AS "expiration"
              FROM "orders" "o"
              JOIN "nft_balances" "nb"
                on "o"."maker" = "nb"."owner"
              JOIN "token_sets_tokens" "tst"
                ON "o"."token_set_id" = "tst"."token_set_id"
                AND "nb"."contract" = "tst"."contract"
                AND "nb"."token_id" = "tst"."token_id"
              WHERE "o"."maker" = $/maker/
                AND "o"."side" = 'sell'
                AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                AND "nb"."contract" = $/contract/
                AND "nb"."token_id" = $/tokenId/
            `,
            {
              maker,
              contract,
              tokenId,
              timestamp,
            }
          );
        }

        // Filter out orders which have the same fillability status as before
        fillabilityStatuses = fillabilityStatuses.filter(
          ({ old_status, new_status }) => old_status !== new_status
        );

        if (fillabilityStatuses.length) {
          const columns = new pgp.helpers.ColumnSet(
            ["id", "fillability_status", "expiration"],
            {
              table: "orders",
            }
          );
          const values = pgp.helpers.values(
            fillabilityStatuses.map(({ id, new_status, expiration }) => ({
              id,
              fillability_status: new_status,
              expiration,
            })),
            columns
          );

          await db.none(
            `
              UPDATE "orders" AS "o" SET
                "fillability_status" = "x"."fillability_status"::order_fillability_status_t,
                "expiration" = "x"."expiration",
                "updated_at" = now()
              FROM (VALUES ${values}) AS "x"("id", "fillability_status", "expiration")
              WHERE "o"."id" = "x"."id"::text
            `
          );
        }

        // Re-check all affected orders
        await orderUpdatesById.addToQueue(
          fillabilityStatuses.map(({ id }) => ({ context, id }))
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle maker info ${job.data}: ${error}`
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

export type MakerInfo = {
  // Deterministic context that triggered the job
  context: string;
  // The timestamp of the event that triggered the job
  timestamp: number;
  side: "buy" | "sell";
  maker: Buffer;
  contract?: Buffer;
  // Only relevant for sell orders
  tokenId?: string;
};

export const addToQueue = async (makerInfos: MakerInfo[]) => {
  // Ignore empty makers
  makerInfos = makerInfos.filter(
    ({ maker }) => !maker.equals(toBuffer(AddressZero))
  );

  await queue.addBulk(
    makerInfos.map((makerInfo) => ({
      name: fromBuffer(makerInfo.maker),
      data: makerInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: `${makerInfo.context}-${fromBuffer(makerInfo.maker)}`,
      },
    }))
  );
};
