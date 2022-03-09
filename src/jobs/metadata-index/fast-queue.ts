import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

const QUEUE_NAME = "metadata-index-fast-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 5 * 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data as FastIndexInfo;

      try {
        const url = `${config.metadataApiBaseUrl}/v3/${network}/fast-metadata?collection=${collection}`;
        const { data } = await axios.get(url);

        const metadata: {
          tokenId: string;
          name?: string;
          description?: string;
          imageUrl?: string;
          attributes: {
            key: string;
            value: string;
            kind: "string" | "number" | "date" | "range";
            rank?: number;
          }[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }[] = (data as any).metadata;

        await metadataIndexWrite.addToQueue(
          metadata.map((m) => ({
            ...m,
            collection,
            contract: collection,
          }))
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process fast metadata index info ${JSON.stringify(
            job.data
          )}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type FastIndexInfo = {
  collection: string;
};

export const addToQueue = async (fastIndexInfos: FastIndexInfo[]) => {
  await queue.addBulk(
    fastIndexInfos.map((fastIndexInfo) => ({
      name: fastIndexInfo.collection,
      data: fastIndexInfo,
    }))
  );
};
