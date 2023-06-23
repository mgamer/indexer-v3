/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { getNetworkName } from "@/config/network";

const QUEUE_NAME = "backfill-collections-ids";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && getNetworkName() === "prod-goerli") {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const limit = 100;
      const result = await idb.manyOrNone(
        `
            WITH x AS (
                SELECT DISTINCT collection_id FROM tokens 
                WHERE NOT EXISTS (
                    SELECT id FROM collections c WHERE 
                    c.id = tokens.collection_id 
                ) 
                LIMIT $/limit/
            )
            SELECT y.* FROM x
            LEFT JOIN LATERAL (
                SELECT tokens.contract, tokens.token_id
                FROM tokens t
                WHERE tokens.collection_id = x.collection_id
                LIMIT 1
            ) y ON TRUE        
        `,
        { limit }
      );

      for (const { contract, token_id } of result) {
        await fetchCollectionMetadataJob.addToQueue([
          {
            contract: fromBuffer(contract),
            tokenId: token_id,
            allowFallbackCollectionMetadata: false,
            context: "post-refresh-collection",
          },
        ]);
      }

      if (result.length == limit) {
        await addToQueue();
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
