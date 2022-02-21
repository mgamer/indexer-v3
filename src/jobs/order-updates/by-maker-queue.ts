import { AddressZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
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
                END)::timestamptz AS "expiration"
              FROM "orders" "o"
              JOIN "ft_balances" "fb"
                ON "o"."maker" = "fb"."owner"
              WHERE "o"."maker" = $/maker/
                AND "o"."side" = 'buy'
                AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                AND "fb"."contract" = $/contract/
            `,
            {
              maker: toBuffer(maker),
              contract: toBuffer(contract),
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
                END)::timestamptz AS "expiration"
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
              maker: toBuffer(maker),
              contract: toBuffer(contract),
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

          if (maker === "0xf6aafb44bc183d3083bfae12d743d947ca376562") {
            logger.info("debug", JSON.stringify(fillabilityStatuses));
          }

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
                "expiration" = "x"."expiration"::timestamptz,
                "updated_at" = now()
              FROM (VALUES ${values}) AS "x"("id", "fillability_status", "expiration")
              WHERE "o"."id" = "x"."id"::text
            `
          );
        }

        // Re-check all affected orders
        await orderUpdatesById.addToQueue(
          fillabilityStatuses.map(({ id }) => ({
            context: `${context}-${id}`,
            id,
          }))
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle maker info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type MakerInfo = {
  // The context represents a deterministic id for what triggered
  // the job in the first place. Since this is what's going to be
  // set as the id of the job, the queue is only going to process
  // a context once (further jobs that have the same context will
  // be ignored - as long as the queue still holds past jobs with
  // the same context). It is VERY IMPORTANT to have this in mind
  // and set the contexts distinctive enough so that jobs are not
  // going to be wrongfully ignored. However, to be as performant
  // as possible it's also important to not have the contexts too
  // distinctive in order to avoid doing duplicative work.
  context: string;
  // The timestamp of the event that triggered the job
  timestamp: number;
  side: "buy" | "sell";
  maker: string;
  contract: string;
  // Only relevant for sell orders
  tokenId?: string;
};

export const addToQueue = async (makerInfos: MakerInfo[]) => {
  // Ignore empty makers
  makerInfos = makerInfos.filter(({ maker }) => maker !== AddressZero);

  await queue.addBulk(
    makerInfos.map((makerInfo) => ({
      name: makerInfo.maker,
      data: makerInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: makerInfo.context,
      },
    }))
  );
};
