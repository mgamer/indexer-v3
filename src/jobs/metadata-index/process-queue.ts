import axios from "axios";
import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

const QUEUE_NAME = "metadata-index-process-queue";

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
    timeout: 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  type TokenMetadata = {
    contract: string;
    tokenId: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    mediaUrl?: string;
    attributes: {
      key: string;
      value: string;
      kind: "string" | "number" | "date" | "range";
      rank?: number;
    }[];
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { method, collection } = job.data;
      const count = method == "rarible" ? 50 : 20;
      const queryParams = new URLSearchParams();

      // Get the tokens from the list
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const tokens = await pendingRefreshTokens.get(count);

      // Build the query string
      for (const token of tokens) {
        queryParams.append("method", method);
        queryParams.append("token", token);
      }

      // Get the metadata for the tokens
      const url = `${
        config.metadataApiBaseUrl
      }/v4/${network}/metadata/token?${queryParams.toString()}`;

      const metadataResult = await axios.get(url, { timeout: 60 * 1000 }).then(({ data }) => data);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata: TokenMetadata[] = (metadataResult as any).metadata;

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
          collection,
        }))
      );

      // If there are potentially more tokens to process trigger another job
      if (_.size(tokens) == count) {
        await addToQueue(method, collection);
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (method: string, collection: string) => {
  await queue.add(randomUUID(), { method, collection });
};
