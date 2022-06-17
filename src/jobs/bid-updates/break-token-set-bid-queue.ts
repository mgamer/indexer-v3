import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import * as topBidUpdateQueue from "@/jobs/bid-updates/top-bid-update-queue";
import { fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "break-token-set-bid-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const bidUpdateBatchSize = 200;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { tokenSetId, contract, tokenId } = job.data;

      let continuationFilter = "";
      if (contract && tokenId) {
        continuationFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
      } else {
        // This is the first run trigger update for the first group
        await topBidUpdateQueue.addToQueue(tokenSetId);
      }

      // Start breaking the contract / range / list
      const query = `SELECT *
                     FROM (
                        SELECT contract, token_id
                        FROM token_sets_tokens
                        WHERE token_set_id = $/tokenSetId/
                        ${continuationFilter}
                        ORDER BY contract, token_id ASC
                        LIMIT ${bidUpdateBatchSize}
                     ) x
                     ORDER BY contract, token_id DESC
                     LIMIT 1`;

      const result = await redb.oneOrNone(query, {
        tokenSetId,
        contract: contract ? toBuffer(contract) : "",
        tokenId,
      });

      if (result) {
        await topBidUpdateQueue.addToQueue(fromBuffer(result.contract), result.token_id);
        await addToQueue(tokenSetId, fromBuffer(result.contract), result.token_id);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  tokenSetId: string,
  contract: string | null = null,
  tokenId: string | null = null
) => {
  await queue.add(randomUUID(), { tokenSetId, contract, tokenId });
};
