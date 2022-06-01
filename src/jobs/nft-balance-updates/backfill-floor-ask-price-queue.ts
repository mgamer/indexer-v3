/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import * as updateNftBalanceFloorAskPriceQueue from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";

const QUEUE_NAME = "nft-balance-updates-backfill-floor-ask-price-queue";

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
      const cursor = job.data.cursor as CursorInfo;

      const limit = 200;
      let continuationFilter = "";

      if (cursor) {
        continuationFilter = `AND (maker, token_set_id) > ($/maker/, $/tokenSetId/)`;
      }

      const sellOrders = await idb.manyOrNone(
        `
          SELECT
            o.maker,
            o.token_set_id
          FROM orders o 
          WHERE o.side = 'sell'
          AND o.fillability_status = 'fillable'
          AND o.approval_status = 'approved'
          ${continuationFilter}
          GROUP BY maker, token_set_id
          LIMIT $/limit/;
          `,
        {
          maker: cursor?.maker ? toBuffer(cursor.maker) : null,
          tokenSetId: cursor?.tokenSetId,
          limit,
        }
      );

      if (sellOrders) {
        const updateFloorAskPriceInfos = [];

        for (const sellOrder of sellOrders) {
          const [, contract, tokenId] = sellOrder.token_set_id.split(":");

          updateFloorAskPriceInfos.push({
            contract: contract,
            tokenId: tokenId,
            owner: fromBuffer(sellOrder.maker),
          });
        }

        await updateNftBalanceFloorAskPriceQueue.addToQueue(updateFloorAskPriceInfos);

        if (_.size(sellOrders) == limit) {
          const lastSellOrder = _.last(sellOrders);

          const nextCursor = {
            maker: fromBuffer(lastSellOrder.maker),
            tokenSetId: lastSellOrder.token_set_id,
          };

          logger.info(
            QUEUE_NAME,
            `Updated ${limit} records.  nextCursor=${JSON.stringify(nextCursor)}`
          );

          await addToQueue(nextCursor);
        }
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
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export type CursorInfo = {
  maker: string;
  tokenSetId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 2000 });
};
