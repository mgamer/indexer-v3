/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

const QUEUE_NAME = "resync-orders-source-queue";

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
      const { continuation, maxId } = job.data;
      const limit = 2000;
      const updateValues = {};
      let continuationFilter = "";

      if (continuation != "") {
        continuationFilter = `WHERE id > '${continuation}'`;

        if (maxId != "") {
          continuationFilter += ` AND id < '${maxId}'`;
        }
      }

      const query = `SELECT id, source_id, source_id_int
                     FROM orders
                     ${continuationFilter}
                     ORDER BY id ASC
                     LIMIT ${limit}`;

      const orders = await idb.manyOrNone(query);

      if (orders) {
        for (const order of orders) {
          if (_.isNull(order.source_id)) {
            continue;
          }

          const sourceId = fromBuffer(order.source_id);
          let sourceIdInt;

          switch (sourceId) {
            case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": // OpenSea
              sourceIdInt = 1;
              break;

            case "0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4": // Forgotten Market
              sourceIdInt = 2;
              break;

            case "0x5924a28caaf1cc016617874a2f0c3710d881f3c1": // LooksRare
              sourceIdInt = 3;
              break;
          }

          (updateValues as any)[order.id] = sourceIdInt;
        }

        let updateValuesString = "";

        _.forEach(updateValues, (source, id) => {
          updateValuesString += `('${id}', ${source}),`;
        });

        updateValuesString = _.trimEnd(updateValuesString, ",");

        job.data.cursor = null;
        if (_.size(orders) == limit) {
          const lastOrder = _.last(orders);
          logger.info(
            QUEUE_NAME,
            `Updated ${_.size(updateValues)} orders, lastOrder=${JSON.stringify(lastOrder)}`
          );

          job.data.cursor = lastOrder.id;
        }

        try {
          const updateQuery = `UPDATE orders
                             SET source_id_int = x.sourceIdColumn
                             FROM (VALUES ${updateValuesString}) AS x(idColumn, sourceIdColumn)
                             WHERE x.idColumn = orders.id`;

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
      await addToQueue(job.data.cursor, job.data.maxId);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire(["order-resync1"], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(
        "0x2dad2ae8f1d752938fc2a4eba0abaa3d77c8d81eb3847299dad80053089d63e4",
        "0x3000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x39e7bd0e2c4cbf77c0910a9e7e4584718221ca9ccc80c0e54f8543f4025dbdaf",
        "0x4000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x49e91a3592a0e81cae93e5119d05ed434651be5f90c024a0d8f005c7413852d9",
        "0x5000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x59eaae0d8f0c9f474feede9e45876f893df6329c35e380f58c2632a6e51b3970",
        "0x6000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x69e86d78bb9a38edc0ff6e8c6455c4d1c23b543640674ba38c9f6854509a5afa",
        "0x7000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x79e16f145566a8be76c35447dcaed5c07f007f4a8f753799e8ce09421b57527f",
        "0x8000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x89e8b7536349210b28aeb3adbcc8f126b30c9d966cfede4f6e276784c1e74f9a",
        "0x9000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0x99e16ff32cf2d8ad9d9e3b4c48d18bf1e247f2795d2900c9c765425c6fc35f40",
        "0xa000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0xa9e655acc574d1c8ac14e83d04e7142b3cb33be7a51cd189518c79eebc2307aa",
        "0xb000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0xb9e7cef305b4c2def70b0101f1d5961dd3af278f25477485916cdf414f65e6c7",
        "0xc000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0xc9e7945d10b8b5e62f5febd48b168e5680518ccbc51a02bfbb4e86d0f4be17cb",
        "0xd000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0xd9e1fef22dd2992b3ab637e1f07f2f23189d55ed757f4c8a0171018ca7835d8a",
        "0xe000000000000000000000000000000000000000"
      );
      await addToQueue(
        "0xe9e66b34b00bc853203d0379c6220eabb06db61d0f9a1f741085d64bdf0ff050",
        "0xf000000000000000000000000000000000000000"
      );
      await addToQueue("0xf9eba2c29d81bcfd9e358e073d51944bfff9c17baca9c9eb0e87749e64b9f572");
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (continuation = "", maxId = "") => {
  await queue.add(randomUUID(), { continuation, maxId });
};
