/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import * as tokenSet from "@/orderbook/token-sets";
import { generateSchemaHash } from "@/orderbook/orders/utils";

const QUEUE_NAME = "non-flagged-token-set";

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
      const { contract, collectionId } = job.data;
      const collection = await Collections.getById(collectionId);

      if (!collection || collection.tokenCount > config.maxItemsPerBid) {
        return;
      }

      const tokenIds = await Tokens.getNonFlaggedTokenIdsInCollection(contract, collectionId);
      const merkleTree = generateMerkleTree(tokenIds);

      await tokenSet.tokenList.save([
        {
          id: `list:${contract}:${merkleTree.getHexRoot()}`,
          schemaHash: generateSchemaHash(undefined),
          items: {
            contract,
            tokenIds,
          },
        },
      ]);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, collectionId: string) => {
  await queue.add(randomUUID(), { contract, collectionId });
};
