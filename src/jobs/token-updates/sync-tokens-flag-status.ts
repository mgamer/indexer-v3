/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import * as nonFlaggedTokenSet from "@/jobs/token-updates/non-flagged-token-set";
import MetadataApi from "@/utils/metadata-api";

const QUEUE_NAME = "sync-tokens-flag-status";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collectionId } = job.data;
      const collection = await Collections.getById(collectionId);

      // Don't check collections with too many tokens
      if (!collection || collection.tokenCount > config.maxItemsPerBid) {
        return;
      }

      const queryParams = new URLSearchParams();
      queryParams.append("method", config.metadataIndexingMethod);

      const tokenIds = await Tokens.getTokenIdsInCollection(collectionId);

      for (const tokenId of tokenIds) {
        const tokens = [];
        tokens.push({ contract: collection.contract, tokenId });

        try {
          const metadata = await MetadataApi.getTokenMetadata(tokens);

          if (_.isEmpty(metadata)) {
            await Tokens.update(collection.contract, tokenId, {
              isFlagged: Number(metadata[0].flagged),
              lastFlagUpdate: new Date().toISOString(),
            });
          }
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(
              QUEUE_NAME,
              `Too Many Requests. error: ${JSON.stringify((error as any).response.data)}`
            );
          }
        }
      }

      await nonFlaggedTokenSet.addToQueue(collection.contract, collectionId);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collectionId: string) => {
  await queue.add(randomUUID(), { collectionId });
};
