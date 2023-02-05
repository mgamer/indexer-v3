/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, extendLock, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import MetadataApi from "@/utils/metadata-api";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";

const QUEUE_NAME = "metadata-index-process-queue-by-slug";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { method, slug, collection, continuation } = job.data;
      if (method !== "opensea") {
        return;
      }
      if (!slug) {
        logger.warn(
          QUEUE_NAME,
          `Method=${method}. Slug is empty, pushing message to the following queues: ${metadataIndexFetch.QUEUE_NAME}, ${collectionUpdatesMetadata.QUEUE_NAME}`
        );
        await Promise.all([
          metadataIndexFetch.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method,
                  collection,
                },
              },
            ],
            true
          ),
          collectionUpdatesMetadata.addToQueue(collection, "1", method, 0),
        ]);
        return;
      }

      const metadata = [];

      let rateLimitExpiredIn = 0;

      try {
        const results = await MetadataApi.getTokensMetadataBySlug(
          collection,
          slug,
          method,
          continuation
        );
        metadata.push(...results.metadata);
        // if (metadata.length === 0) {
        // logger.warn(
        //     QUEUE_NAME,
        //     `Method=${method}. Metadata list is empty, pushing message to the following queues: ${metadataIndexFetch.QUEUE_NAME}, ${collectionUpdatesMetadata.QUEUE_NAME}`
        // );
        //   await Promise.all([
        //     metadataIndexFetch.addToQueue(
        //       [
        //         {
        //           kind: "full-collection",
        //           data: {
        //             method,
        //             collection,
        //           },
        //         },
        //       ],
        //       true
        //     ),
        //     collectionUpdatesMetadata.addToQueue(collection, "1", method, 0),
        //   ]);
        //   return;
        // }
        if (results.continuation) {
          await addToQueue({
            collection,
            slug,
            method,
            continuation: results.continuation,
          });
        }
      } catch (error: any) {
        if (error.response?.status === 429) {
          logger.warn(
            QUEUE_NAME,
            `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
          );

          rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.response.data.expires_in, 5);
        } else if (error.response?.status === 400) {
          logger.warn(
            QUEUE_NAME,
            `Validation error using slug, pushing message to queue ${
              metadataIndexFetch.QUEUE_NAME
            }. method=${method}, error=${JSON.stringify(error.response.data)}`
          );
          await metadataIndexFetch.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method,
                  collection,
                },
              },
            ],
            true
          );
        } else {
          logger.error(
            QUEUE_NAME,
            `Error. method=${method}, status=${error.response?.status}, error=${JSON.stringify(
              error.response.data
            )}`
          );
        }
      }

      logger.info(
        QUEUE_NAME,
        `Debug. method=${method}, metadata=${metadata.length}, rateLimitExpiredIn=${rateLimitExpiredIn}`
      );

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
        }))
      );

      // If there are potentially more tokens to process trigger another job
      if (rateLimitExpiredIn) {
        if (await extendLock(getLockName(method), 60 * 5 + rateLimitExpiredIn)) {
          await addToQueue(
            {
              collection,
              slug,
              method,
              continuation,
            },
            rateLimitExpiredIn * 1000
          );
        }
      } else {
        await releaseLock(getLockName(method));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = (method: string) => {
  return `${QUEUE_NAME}:${method}`;
};

export const addToQueue = async (
  data: { method: string; collection: string; continuation?: string; slug?: string },
  delay = 0
) => {
  await queue.add(
    randomUUID(),
    {
      method: data.method,
      collection: data.collection,
      continuation: data.continuation,
      slug: data.slug,
    },
    { delay }
  );
};
