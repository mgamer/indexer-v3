import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

// Whenever a fill happens, we want to extract some useful information
// out of that. Things like the last time a token set got sold/bought
// and the associated price it was sold/bought at could offer valuable
// information to users. Extracting fill-related data is to be done here.

const JOB_NAME = "fills_handle";

const queue = new Queue(JOB_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 10000,
    removeOnFail: true,
  },
});
new QueueScheduler(JOB_NAME, { connection: redis });

export type FillInfo = {
  // The context will ensure the queue won't process the same job more
  // than once in the same context (over a recent time period)
  context: string;
  buyHash: string;
  sellHash: string;
  block: number;
};

export const addToFillsHandleQueue = async (fillInfos: FillInfo[]) => {
  await queue.addBulk(
    fillInfos.map((fillInfo) => ({
      name: fillInfo.buyHash + fillInfo.sellHash,
      data: fillInfo,
      opts: {
        // Since it can happen to sync and handle the same events more
        // than once, we should make sure not to do any expensive work
        // more than once for the same event. As such, we keep the last
        // performed jobs in the queue (via the above `removeOnComplete`
        // option) and give the jobs a deterministic id so that a job
        // will not be re-executed if it already did recently.
        jobId:
          fillInfo.context + "-" + fillInfo.buyHash + "-" + fillInfo.sellHash,
      },
    }))
  );
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { buyHash, sellHash, block } = job.data;

      try {
        let orderHash: string | undefined;
        if (buyHash === HashZero && sellHash !== HashZero) {
          orderHash = sellHash;
        } else if (sellHash === HashZero && buyHash !== HashZero) {
          orderHash = buyHash;
        }

        if (!orderHash) {
          // Skip if we can't detect which side was the maker
          return;
        }

        const result = await db.oneOrNone(
          `
            select
              "o"."side",
              "o"."token_set_id",
              "o"."value"
            from "orders" "o"
            where "o"."hash" = $/orderHash/
          `,
          { orderHash }
        );

        if (result && result.token_set_id) {
          const components = result.token_set_id.split(":");
          if (components[0] === "token") {
            const [contract, tokenId] = components.slice(1);

            await db.none(
              `
                update "tokens" set
                  "last_${result.side}_block" = $/block/,
                  "last_${result.side}_value" = $/value/
                where "contract" = $/contract/
                  and "token_id" = $/tokenId/
              `,
              {
                contract,
                tokenId,
                block,
                value: result.value,
              }
            );
          }

          logger.info(
            JOB_NAME,
            `Updated sale data for token set ${result.token_set_id}`
          );
        }
      } catch (error) {
        logger.error(
          JOB_NAME,
          `Failed to handle fill (${buyHash}, ${sellHash}): ${error}`
        );
        throw error;
      }
    },
    { connection: redis }
  );
  worker.on("error", (error) => {
    logger.error(JOB_NAME, `Worker errored: ${error}`);
  });
}
