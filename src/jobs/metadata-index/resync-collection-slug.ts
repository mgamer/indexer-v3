/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";
import { Collections } from "@/models/collections";
import { fromBuffer } from "@/common/utils";

const QUEUE_NAME = "resync-collection-slug-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 10000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { continuation } = job.data;
      const limit = 1000;
      let continuationFilter = "";

      if (continuation != "") {
        continuationFilter = `WHERE slug > '${continuation}'`;
      }

      const query = `SELECT id, slug, contract
                     FROM collections
                     ${continuationFilter}
                     ORDER BY slug ASC
                     LIMIT ${limit}`;

      const collections = await idb.manyOrNone(query);

      if (collections) {
        for (const collection of collections) {
          const contract = fromBuffer(collection.contract);
          if (
            contract == "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a" ||
            contract == "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270"
          ) {
            continue;
          }

          try {
            await Collections.updateCollectionMetadata(contract, "1");
          } catch (error) {
            logger.info(QUEUE_NAME, `${error}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (_.size(collections) == limit) {
          const lastCollection = _.last(collections);
          logger.info(
            QUEUE_NAME,
            `Updated ${limit} collections, lastCollection=${JSON.stringify(lastCollection)}`
          );
          await addToQueue(lastCollection.slug);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock.acquire(["slug-resync"], 60 * 24 * 7 * 1000).then(() => addToQueue());
}

export const addToQueue = async (continuation = "") => {
  await queue.add(randomUUID(), { continuation });
};
