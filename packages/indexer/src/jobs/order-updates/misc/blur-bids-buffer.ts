import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";
import * as blurBidsRefresh from "@/jobs/order-updates/misc/blur-bids-refresh";

const QUEUE_NAME = "blur-bids-buffer";

const getCacheKey = (collection: string) => `blur-bid-incoming-price-points:${collection}`;

export const handleNewPricePoints = async (
  collection: string,
  pricePoints: Sdk.Blur.Types.BlurBidPricePoint[]
) =>
  Promise.all(
    pricePoints.map((pp) => redis.hset(getCacheKey(collection), pp.price, JSON.stringify(pp)))
  );

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 0,
    removeOnFail: 10000,
    timeout: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data as { collection: string };

      try {
        const result = await redis.hvals(getCacheKey(collection));
        if (result.length) {
          await redis.del(getCacheKey(collection));

          await orderbook.addToQueue([
            {
              kind: "blur-bid",
              info: {
                orderParams: {
                  collection,
                  pricePoints: result.map((r) => JSON.parse(r)),
                },
                metadata: {},
              },
            },
          ]);

          await blurBidsRefresh.addToQueue(collection);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to refresh Blur bids for collection ${collection}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string) =>
  queue.add(
    collection,
    { collection },
    {
      jobId: collection,
      repeat: {
        every: 5 * 1000,
      },
    }
  );
