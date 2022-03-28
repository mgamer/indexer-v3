import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";

const QUEUE_NAME = "metadata-index-fetch-queue";

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
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as MetadataIndexInfo;
      const prioritized = !_.isUndefined(job.opts.priority);
      const limit = 1000;
      let tokens: string[] = [];

      if (kind === "full-collection") {
        // Get batch of tokens for the collection
        const [contract, tokenId] = data.continuation
          ? data.continuation.split(":")
          : [AddressZero, "0"];
        tokens = await getTokensForCollection(data.collection, contract, tokenId, limit);

        // If there are potentially more tokens to refresh
        if (!_.isEmpty(tokens) && _.size(tokens) == limit) {
          const lastToken = _.last(tokens);
          await addToQueue(
            [
              {
                kind,
                data: {
                  ...data,
                  continuation: lastToken,
                },
              },
            ],
            prioritized
          );
        }
      } else if (kind === "single-token") {
        // Create the single token from the params
        tokens.push(`${data.contract}:${data.tokenId}`);
      }

      // Add the tokens to the list
      const pendingRefreshTokens = new PendingRefreshTokens(data.method);
      await pendingRefreshTokens.add(tokens, prioritized);

      // Trigger a job to process the queue
      await metadataIndexProcess.addToQueue(data.method, data.collection);
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

async function getTokensForCollection(
  collection: string,
  contract: string,
  tokenId: string,
  limit: number
) {
  const tokens = await idb.manyOrNone(
    `SELECT tokens.contract, tokens.token_id
              FROM tokens
              WHERE tokens.collection_id = $/collection/
              AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)
              LIMIT ${limit}`,
    {
      collection: collection,
      contract: toBuffer(contract),
      tokenId: tokenId,
    }
  );

  return tokens.map((t) => `${fromBuffer(t.contract)}:${t.token_id}`);
}

// We support the following metadata indexing methods.
type IndexingMethod = "opensea" | "rarible";

export type MetadataIndexInfo =
  | {
      kind: "full-collection";
      data: {
        method: IndexingMethod;
        collection: string;
        continuation?: string;
      };
    }
  | {
      kind: "single-token";
      data: {
        method: IndexingMethod;
        collection: string;
        contract: string;
        tokenId: string;
      };
    };

export const addToQueue = async (metadataIndexInfos: MetadataIndexInfo[], prioritized = false) => {
  await queue.addBulk(
    metadataIndexInfos.map((metadataIndexInfo) => ({
      name: randomUUID(),
      data: metadataIndexInfo,
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    }))
  );
};
