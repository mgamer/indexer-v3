import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { db, pgp } from "@/common/db";

// Unfortunately, on-chain events only include the block they were
// triggered at but not the associated timestamp. However, to have
// a good UX, in different APIs we want to return the timestamp as
// well. In order to do that, we must have a separate process that
// deals with fetching the timestamps of blocks.

const BACKFILL_JOB_NAME = "blocks_fetch_backfill";

export const backfillQueue = new Queue(BACKFILL_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(BACKFILL_JOB_NAME, { connection: redis.duplicate() });

export const addToBlocksFetchBackfillQueue = async (
  fromBlock: number,
  toBlock: number
) => {
  const jobs: any[] = [];
  const blocksPerBatch = 128;

  // Sync in reverse in order to handle more recent events first
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: `${fromBlock}-${toBlock}`,
      data: {
        fromBlock: from,
        toBlock: to,
      },
    });
  }

  await backfillQueue.addBulk(jobs);
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    BACKFILL_JOB_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock } = job.data;

      try {
        // Fetch all blocks in the given range that were already processed
        const existingBlocks: { [block: number]: boolean } = await db
          .manyOrNone(
            `
              select "b"."block" from "block" where "b"."block" in ($1:csv)
            `,
            [
              [...Array(toBlock - fromBlock + 1).keys()].map(
                (i) => i + fromBlock
              ),
            ]
          )
          .then((blocks) =>
            Object.fromEntries(blocks.map(({ block }) => [block, true]))
          );

        let blockValues: any[] = [];
        for (let block = fromBlock; block <= toBlock; block++) {
          // Only process the blocks that were not previously processed
          if (!existingBlocks[block]) {
            const timestamp = (await baseProvider.getBlock(block)).timestamp;
            blockValues.push({
              block,
              timestamp,
            });
          }
        }

        if (blockValues.length) {
          const columns = new pgp.helpers.ColumnSet(["block", "timestamp"], {
            table: "blocks",
          });
          const values = pgp.helpers.values(blockValues, columns);

          await db.none(`
            insert into "blocks" (
              "block",
              "timestamp"
            ) values ${values}
            on conflict do nothing
          `);
        }
      } catch (error) {
        logger.error(
          BACKFILL_JOB_NAME,
          `Blocks fetch backfill job failed: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );
  worker.on("error", (error) => {
    logger.error(BACKFILL_JOB_NAME, `Worker errored: ${error}`);
  });
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/15 * * * * *", async () => {
    const lockAcquired = await acquireLock("blocks_fetch_lock", 10);
    if (lockAcquired) {
      logger.info("blocks_fetch", "Fetching blocks");

      try {
        const currentBlock = await baseProvider.getBlockNumber();

        let lastBlock = Number(await redis.get("blocks_fetch_last_block"));
        if (lastBlock === 0) {
          lastBlock = currentBlock - 1;
        }

        if (lastBlock < currentBlock) {
          let blockValues: any[] = [];
          for (let block = lastBlock + 1; block <= currentBlock; block++) {
            const timestamp = (await baseProvider.getBlock(block)).timestamp;
            blockValues.push({
              block,
              timestamp,
            });
            await redis.set("blocks_fetch_last_block", block);
          }

          if (blockValues.length) {
            const columns = new pgp.helpers.ColumnSet(["block", "timestamp"], {
              table: "blocks",
            });
            const values = pgp.helpers.values(blockValues, columns);

            await db.none(`
              insert into "blocks" (
                "block",
                "timestamp"
              ) values ${values}
              on conflict do nothing
            `);
          }
        }
      } catch (error) {
        logger.error("blocks_fetch", `Failed to fetch blocks: ${error}`);
      }
    }
  });
}
