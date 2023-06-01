/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";
import { baseProvider } from "@/common/provider";

const QUEUE_NAME = "backfill-foundation-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { side, id, createdAt } = job.data;
      const limit = 100;

      const results = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            orders.raw_data AS order_raw_data,
            orders.created_at
          FROM orders
          WHERE orders.side = $/side/
            AND kind = 'foundation'
            AND (orders.fillability_status = 'no-balance')
            AND (orders.created_at, orders.id) < ($/createdAt/, $/id/)
          ORDER BY
            orders.created_at DESC,
            orders.id DESC
          LIMIT $/limit/
        `,
        {
          side,
          createdAt,
          id,
          limit,
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
        table: "orders",
      });

      const exchange = new Sdk.Foundation.Exchange(config.chainId);
      const conrtact = exchange.contract.connect(baseProvider);
      for (const r of results) {
        try {
          const order_raw_data = r.order_raw_data;
          const onchainState = await conrtact.getBuyPrice(
            order_raw_data.contract,
            order_raw_data.tokenId
          );
          if (
            order_raw_data.maker == onchainState.seller.toLowerCase() &&
            order_raw_data.price == onchainState.price.toString()
          ) {
            values.push({
              id: r.id,
              fillability_status: "fillable",
            });
          }
        } catch {
          // skip error
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = x.fillability_status::order_fillability_status_t,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(id, fillability_status)
            WHERE orders.id = x.id::TEXT
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(side, lastResult.created_at, lastResult.id);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-7`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue("sell", new Date().toISOString(), HashZero);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (side: string, createdAt: string, id: string) => {
  await queue.add(randomUUID(), { side, id, createdAt }, { jobId: `${side}-${createdAt}-${id}-7` });
};
