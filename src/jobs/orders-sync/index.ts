import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { sync } from "@/orders/orderbook";
import { arweaveGateway } from "@/common/provider";

// Just like events syncing, for syncing orders we have two separate
// job queues. One is for handling backfilling while the other one
// handles realtime syncing.

// Backfill

const BACKFILL_JOB_NAME = "orders_sync_backfill";

const backfillQueue = new Queue(BACKFILL_JOB_NAME, {
  connection: redis.duplicate(),
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
new QueueScheduler(BACKFILL_JOB_NAME, { connection: redis.duplicate() });

type BackfillingOptions = {
  blocksPerBatch?: number;
};

export const addToOrdersSyncBackfillQueue = async (
  fromBlock: number,
  toBlock: number,
  options?: BackfillingOptions
) => {
  const jobs: any[] = [];

  // Syncing is done in batches since the requested block range
  // might include lots of events that cannot fit within a single
  // provider response
  const blocksPerBatch = options?.blocksPerBatch ?? 64;

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

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    BACKFILL_JOB_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock } = job.data;

      try {
        logger.info(
          "orders_sync",
          `Orders backfill syncing block range [${fromBlock}, ${toBlock}]`
        );

        await sync(fromBlock, toBlock);
      } catch (error) {
        logger.error("orders_sync", `Orders backfill job failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(BACKFILL_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Catchup

const CATCHUP_JOB_NAME = "orders_sync_catchup";

const catchupQueue = new Queue(CATCHUP_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // No retries here, we should be as lean as possible and
    // retrying will be implicitly done on subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(CATCHUP_JOB_NAME, { connection: redis.duplicate() });

export const addToOrdersSyncCatchupQueue = async () => {
  await catchupQueue.add("orders_sync", null);
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    CATCHUP_JOB_NAME,
    async (_job: Job) => {
      try {
        // We allow syncing of up to `maxBlocks` blocks behind the
        // head of the blockchain. If the indexer lagged behind more
        // than that, then all blocks before that will be sent to the
        // backfill queue.
        const maxBlocks = 64;

        let headBlock = (await arweaveGateway.blocks.getCurrent()).height;
        headBlock -= 3;

        // Fetch the last synced blocked for the current contract type (if it exists)
        let localBlock = Number(await redis.get(`orders_last_synced_block`));
        if (localBlock >= headBlock) {
          // Nothing to sync
          return;
        }

        if (!localBlock) {
          localBlock = headBlock;
        } else {
          localBlock++;
        }

        const fromBlock = Math.max(localBlock, headBlock - maxBlocks + 1);
        logger.info(
          "orders_sync",
          `Orders catchup syncing block range [${fromBlock}, ${headBlock}]`
        );

        const orders = await sync(fromBlock, headBlock);
        if (orders.length) {
          logger.info(
            "orders_sync",
            `Fetched orders: ${JSON.stringify(orders)}`
          );
        }

        // Queue any remaining blocks for backfilling
        if (localBlock < fromBlock) {
          await addToOrdersSyncBackfillQueue(localBlock, fromBlock - 1);
        }

        await redis.set(`orders_last_synced_block`, String(headBlock));
      } catch (error) {
        logger.error("orders_sync", `Orders catchup failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );
  worker.on("error", (error) => {
    logger.error(CATCHUP_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Every new block (approximately 2 minutes) there might be processes
// we want to run in order to stay up-to-date with the blockchain's
// current state. These processes are all to be triggered from this
// cron job.

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  cron.schedule("*/2 * * * *", async () => {
    const lockAcquired = await acquireLock("orders_sync_catchup_lock", 115);
    if (lockAcquired) {
      logger.info("orders_sync_catchup_cron", "Catching up orders");

      try {
        await addToOrdersSyncCatchupQueue();
      } catch (error) {
        logger.error(
          "orders_sync_catchup_cron",
          `Failed to catch up orders: ${error}`
        );
      }
    }
  });
}
