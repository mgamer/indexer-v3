import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { syncEvents } from "@/events-sync/index";

// For syncing events we have two separate job queues. One is for
// handling backfilling of past event while the other one handles
// realtime syncing of events. The reason for having these two be
// separated is that we don't want any ongoing backfilling action
// to delay realtime syncing (which tries to catch up to the head
// of the blockchain).

// Backfill

const BACKFILL_QUEUE_NAME = "events-sync-backfill";

export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    // TODO: Introduce jitter
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock } = job.data;

      try {
        logger.info(
          BACKFILL_QUEUE_NAME,
          `Events backfill syncing block range [${fromBlock}, ${toBlock}]`
        );

        await syncEvents(fromBlock, toBlock);
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Events backfill syncing failed: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

type BackfillOptions = {
  blocksPerBatch?: number;
  prioritized?: boolean;
};

export const addToEventsSyncBackfillQueue = async (
  fromBlock: number,
  toBlock: number,
  options?: BackfillOptions
) => {
  // Syncing is done in several batches since the requested block
  // range might result in lots of events which could potentially
  // not fir within a single provider response.
  const blocksPerBatch = options?.blocksPerBatch ?? 16;

  // Important backfill processes should be prioritized
  const prioritized = options?.prioritized ?? false;

  // Sync in reverse to handle more recent events first
  const jobs: any[] = [];
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: `${from}-${to}`,
      data: {
        fromBlock: from,
        toBlock: to,
      },
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    });
  }

  // Random shuffle the jobs (via the Fisher-Yates algorithm) in order
  // to avoid database deadlocks as much as possible (these occur when
  // atomically updating balances given inserted transfers).
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    let tmp = jobs[i];
    jobs[i] = jobs[j];
    jobs[j] = tmp;
  }

  await backfillQueue.addBulk(jobs);
};

// Realtime

const REALTIME_QUEUE_NAME = "events-sync-realtime";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    REALTIME_QUEUE_NAME,
    async (_job: Job) => {
      try {
        // We allow syncing of up to `maxBlocks` blocks behind the head
        // of the blockchain. If we lag behind more than that, then all
        // previous blocks that we cannot cover here will be relayed to
        // the backfill queue.
        const maxBlocks = 16;

        const headBlock = await baseProvider.getBlockNumber();

        // Fetch the last synced blocked
        let localBlock = Number(
          await redis.get(`${REALTIME_QUEUE_NAME}-last-block`)
        );
        if (localBlock >= headBlock) {
          // Nothing to sync
          return;
        }

        if (localBlock === 0) {
          localBlock = headBlock;
        } else {
          localBlock++;
        }

        const fromBlock = Math.max(localBlock, headBlock - maxBlocks + 1);
        logger.info(
          REALTIME_QUEUE_NAME,
          `Events realtime syncing block range [${fromBlock}, ${headBlock}]`
        );

        await syncEvents(fromBlock, headBlock);

        // Send any remaining blocks to the backfill queue
        if (localBlock < fromBlock) {
          await addToEventsSyncBackfillQueue(localBlock, fromBlock - 1);
        }

        // To avoid missing any events, save the last synced block with a delay
        // in order to ensure that the latest blocks will get queried more than
        // once, which is exactly what we are looking for (since events for the
        // latest blocks might be missing due to upstream chain reorgs):
        // https://ethereum.stackexchange.com/questions/109660/eth-getlogs-and-some-missing-logs
        await redis.set(`${REALTIME_QUEUE_NAME}-last-block`, headBlock - 5);
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          `Events realtime syncing failed: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.catchup) {
  cron.schedule("*/15 * * * * *", async () => {
    const lockAcquired = await acquireLock("catchup-events-lock", 10);
    if (lockAcquired) {
      logger.info("catchup-events", "Catching up events");

      try {
        await realtimeQueue.add("catchup", {});
      } catch (error) {
        logger.error("catchup-events", `Failed to catch up events: ${error}`);
      }
    }
  });
}
