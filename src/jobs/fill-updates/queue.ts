import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
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
                contract: toBuffer(contract),
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
            `Updated last ${result.side} given token set ${result.token_set_id} (context ${job.id})`
          );
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle fill info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type FillInfo = {
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
        jobId: fillInfo.context,
      },
    }))
  );
};
