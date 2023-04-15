import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";

const QUEUE_NAME = "blur-bids-refresh";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
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
      const { collection } = job.data as { collection: string };

      try {
        const pricePoints = await axios
          .get(`${config.orderFetcherBaseUrl}/api/blur-collection-bids?collection=${collection}`)
          .then((response) => response.data.bids as Sdk.Blur.Types.BlurBidPricePoint[]);

        await orderbook.addToQueue([
          {
            kind: "blur-bid",
            info: {
              orderParams: {
                collection,
                pricePoints,
              },
              metadata: {},
              fullUpdate: true,
            },
          },
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          QUEUE_NAME,
          `Failed to refresh Blur bids for collection ${collection}: ${
            error?.response.data ? JSON.stringify(error.response.data) : error
          }`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
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
        // Run every 5 minutes
        every: 5 * 60 * 1000,
      },
    }
  );
