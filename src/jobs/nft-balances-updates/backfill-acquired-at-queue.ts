/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";

const QUEUE_NAME = "backfill-acquired-at-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 10000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const limit = 2000;

      try {
        const query = `
                    WITH x AS (
                        SELECT
                          nft_balances.contract,
                          nft_balances.token_id,
                          nft_balances.owner,
                          to_timestamp(MAX(nft_transfer_events.timestamp)) AS acquired_at
                        FROM nft_balances
                        JOIN nft_transfer_events ON nft_balances.contract = nft_transfer_events.address
                        AND nft_balances.token_id = nft_transfer_events.token_id
                        AND nft_balances.owner = nft_transfer_events.to
                        WHERE nft_balances.acquired_at IS NULL AND nft_balances.amount > 0
                        GROUP BY nft_balances.contract, nft_balances.token_id, nft_balances.owner
                        LIMIT ${limit}
                    )
                    UPDATE nft_balances AS nb
                    SET acquired_at = x.acquired_at::timestamptz
                    FROM x
                    WHERE nb.contract = x.contract::bytea
                    AND nb.token_id = x.token_id::numeric
                    AND nb.owner = x.owner::bytea;`;

        const { rowCount } = await idb.result(query);

        logger.info(QUEUE_NAME, `Updated ${rowCount} records`);

        if (rowCount > 0) {
          logger.info(QUEUE_NAME, `Triggering next job.`);
          await addToQueue();
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async () => {
  await queue.add(
    randomUUID(),
    {},
    {
      delay: 1000,
    }
  );
};
