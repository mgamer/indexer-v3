import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { unsyncEvents } from "@/events-sync/index";
import * as backfillEventsSync from "@/jobs/events-sync/backfill-queue";

const QUEUE_NAME = "events-sync-block-check";

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
      const { block } = job.data;

      try {
        const wrongBlocks = new Map<number, string>();

        const upstreamBlockHash = (await baseProvider.getBlock(block)).hash;

        // TODO: Use a blocks table instead of aggregating from all individual event tables.
        const result = await idb.manyOrNone(
          `
            (SELECT
              nft_transfer_events.block_hash
            FROM nft_transfer_events
            WHERE nft_transfer_events.block = $/block/)

            UNION

            (SELECT
              ft_transfer_events.block_hash
            FROM ft_transfer_events
            WHERE ft_transfer_events.block = $/block/)

            UNION

            (SELECT
              nft_approval_events.block_hash
            FROM nft_approval_events
            WHERE nft_approval_events.block = $/block/)

            UNION

            (SELECT
              fill_events_2.block_hash
            FROM fill_events_2
            WHERE fill_events_2.block = $/block/)

            UNION

            (SELECT
              cancel_events.block_hash
            FROM cancel_events
            WHERE cancel_events.block = $/block/)

            UNION

            (SELECT
              bulk_cancel_events.block_hash
            FROM bulk_cancel_events
            WHERE bulk_cancel_events.block = $/block/)
          `,
          { block }
        );
        for (const { block_hash } of result) {
          const blockHash = fromBuffer(block_hash);
          if (blockHash !== upstreamBlockHash) {
            wrongBlocks.set(block, blockHash);

            logger.info(QUEUE_NAME, `Detected wrong block ${block} with hash ${blockHash}}`);
          }
        }

        for (const [block, blockHash] of wrongBlocks.entries()) {
          await backfillEventsSync.addToQueue(block, block, {
            prioritized: true,
          });
          await unsyncEvents(block, blockHash);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Block check failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (block: number, delay: number) =>
  queue.add(`${block}-${delay}`, { block }, { jobId: `${block}-${delay}`, delay });
