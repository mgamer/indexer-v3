/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";

const QUEUE_NAME = "resync-attribute-collection-queue";

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
      const updateValues = {};
      let continuationFilter = "";

      if (continuation != "") {
        continuationFilter = `WHERE id > ${Number(continuation)}`;
      }

      const query = `SELECT id, key
                     FROM attribute_keys
                     ${continuationFilter}
                     ORDER BY id ASC
                     LIMIT ${limit}`;

      const attributeKeys = await idb.manyOrNone(query);

      if (attributeKeys) {
        for (const attributeKey of attributeKeys) {
          (updateValues as any)[attributeKey.id] = {
            key: attributeKey.key,
          };
        }

        let updateValuesString = "";

        _.forEach(attributeKeys, (data) => {
          updateValuesString += `(${data.id}, '${data.key}'),`;
        });

        updateValuesString = _.trimEnd(updateValuesString, ",");

        job.data.cursor = null;
        if (_.size(attributeKeys) == limit) {
          const lastAttributeKey = _.last(attributeKeys);
          logger.info(
            QUEUE_NAME,
            `Updated ${_.size(updateValues)} attributes, lastAttributeKey=${JSON.stringify(
              lastAttributeKey
            )}`
          );

          job.data.cursor = lastAttributeKey.id;
        }

        try {
          const updateQuery = `UPDATE attributes
                               SET key = x.keyColumn
                               FROM (VALUES ${updateValuesString}) AS x(idColumn, keyColumn)
                               WHERE x.idColumn = attributes.attribute_key_id`;

          await idb.none(updateQuery);
        } catch (error) {
          logger.error(QUEUE_NAME, `${error}`);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 4 }
  );

  worker.on("completed", async (job) => {
    if (job.data.cursor) {
      await addToQueue(job.data.cursor);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire(["attribute-collection"], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (continuation = "") => {
  await queue.add(randomUUID(), { continuation });
};
