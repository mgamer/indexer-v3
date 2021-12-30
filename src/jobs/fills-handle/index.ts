import { AddressZero } from "@ethersproject/constants";
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
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(JOB_NAME, { connection: redis });

export type FillInfo = {
  buyHash: string;
  sellHash: string;
  price: string;
  block: number;
};

export const addToFillsHandleQueue = async (fillInfos: FillInfo[]) => {
  await queue.addBulk(
    fillInfos.map((fillInfo) => ({
      name: fillInfo.buyHash + fillInfo.sellHash,
      data: fillInfo,
    }))
  );
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { buyHash, sellHash, price, block } = job.data;

      try {
        let orderHash: string | undefined;
        if (buyHash === AddressZero && sellHash !== AddressZero) {
          orderHash = sellHash;
        } else if (sellHash === AddressZero && buyHash !== AddressZero) {
          orderHash = buyHash;
        }

        if (!orderHash) {
          logger.info(JOB_NAME, `Got fill result: nothing`);
          // Skip if we can't detect which side was the maker
          return;
        }

        const result = await db.oneOrNone(
          `
            select "o"."token_set_id" from "orders" "o"
            where "o"."hash" = $/orderHash/
          `,
          { orderHash }
        );

        logger.info(
          JOB_NAME,
          `Got fill result: ${JSON.stringify({ price, block, result })}`
        );
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
