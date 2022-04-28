/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "resync-attribute-sample-image-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { continuation } = job.data;
      const limit = 50;
      let continuationFilter = "";

      if (continuation != "") {
        continuationFilter = `WHERE id > '${continuation}'`;
      }

      const query = `SELECT id
                     FROM collections
                     ${continuationFilter}
                     ORDER BY id ASC
                     LIMIT ${limit}`;

      const collections = await idb.manyOrNone(query);

      if (collections) {
        const collectionsIds = _.join(
          _.map(collections, (collection) => collection.id),
          "','"
        );

        const tokensQuery = `
            SELECT DISTINCT ON (key, value) key, value, tokens.contract, tokens.token_id
            FROM collections
            JOIN tokens ON collections.contract = tokens.contract
            JOIN token_attributes ON tokens.contract = token_attributes.contract AND token_attributes.token_id = tokens.token_id
            WHERE collections.id IN ('$/collectionsIds:raw/')
        `;

        const tokens = await idb.manyOrNone(tokensQuery, { collectionsIds });

        for (const token of tokens) {
          const tokenAttributes = await Tokens.getTokenAttributes(
            fromBuffer(token.contract),
            token.token_id
          );

          for (const tokenAttribute of tokenAttributes) {
            const sampleImageQuery = `
                SELECT (array_agg(DISTINCT(x.image)))[1:4] AS "sampleImages"
                FROM (
                    SELECT image
                    FROM token_attributes
                    JOIN tokens ON token_attributes.contract = tokens.contract AND token_attributes.token_id = tokens.token_id
                    WHERE token_attributes.attribute_id = $/attributeId/
                    LIMIT 4
                ) AS x
            `;

            const images = await idb.oneOrNone(sampleImageQuery, {
              attributeId: tokenAttribute.attributeId,
            });

            const query = `UPDATE attributes
                           SET sample_images = $/images/
                           WHERE id = $/attributeId/`;

            await idb.none(query, {
              attributeId: tokenAttribute.attributeId,
              images: images.sampleImages,
            });

            logger.info(
              QUEUE_NAME,
              `Updated images for contract=${fromBuffer(token.contract)}, token=${
                token.token_id
              }, attribute=${tokenAttribute.attributeId}`
            );
          }
        }

        if (_.size(collections) == limit) {
          const lastCollection = _.last(collections);
          logger.info(QUEUE_NAME, `Updated up to lastCollection=${JSON.stringify(lastCollection)}`);

          await addToQueue(lastCollection.id);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire(["sample-image-resync"], 60 * 60 * 24 * 30 * 1000)
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
