/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as syncEventsUtils from "@/events-sync/utils";

const QUEUE_NAME = "backfill-fill-events-fill-source-queue";

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
    async (job) => {
      const { txHash, logIndex, batchIndex } = job.data;

      const limit = 200;
      const result = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.fill_source
          FROM fill_events_2
          WHERE fill_events_2.tx_hash < $/txHash/
            AND fill_events_2.log_index < $/logIndex/
            AND fill_events_2.batch_index < $/batchIndex/
          ORDER BY
            fill_events_2.tx_hash DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        `,
        { limit, txHash: toBuffer(txHash), logIndex, batchIndex }
      );

      let routerToFillSource: { [address: string]: string } = {};
      if (Sdk.Common.Addresses.Routers[config.chainId]) {
        routerToFillSource = Sdk.Common.Addresses.Routers[config.chainId];
      }

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "taker", "fill_source"],
        {
          table: "fill_events_2",
        }
      );
      for (const { tx_hash, log_index, batch_index, fill_source } of result) {
        if (!fill_source) {
          const tx = await syncEventsUtils.fetchTransaction(fromBuffer(tx_hash));
          if (routerToFillSource[tx.to]) {
            values.push({
              tx_hash,
              log_index,
              batch_index,
              fill_source: routerToFillSource[tx.to],
              taker: toBuffer(tx.from),
            });
          }
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              fill_source = x.fill_source,
              taker = x.taker
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, taker, fill_source)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
          `
        );
      }

      if (result.length >= limit) {
        const lastResult = result[result.length - 1];
        await addToQueue(
          fromBuffer(lastResult.tx_hash),
          lastResult.log_index,
          lastResult.batch_index
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 0, 0);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (txHash: string, logIndex: number, batchIndex: number) => {
  await queue.add(randomUUID(), { txHash, logIndex, batchIndex });
};
