/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "backfill-tokens-normalized-floor-ask-queue";

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
    async () => {
      const token = await idb.oneOrNone(
        `
        SELECT
            tokens.contract,
            tokens.token_id
          FROM tokens
        WHERE tokens.floor_sell_id IS NOT NULL and tokens.normalized_floor_sell_id IS NULL
        LIMIT 1
          `
      );

      if (token) {
        const contract = fromBuffer(token.contract);
        const tokenId = token.token_id;
        const tokenSetId = `token:${contract}:${tokenId}`;

        logger.info(
          QUEUE_NAME,
          `Backfilling token. contract=${contract}, tokenId=${tokenId}, tokenSetId=${tokenSetId}`
        );

        await idb.none(
          `
                  UPDATE tokens SET
                    normalized_floor_sell_id = z.order_id,
                    normalized_floor_sell_value = z.value,
                    normalized_floor_sell_currency = z.currency,
                    normalized_floor_sell_currency_value = z.currency_value,
                    normalized_floor_sell_maker = z.maker,
                    normalized_floor_sell_valid_from = least(
                      2147483647::NUMERIC,
                      date_part('epoch', lower(z.valid_between))
                    )::INT,
                    normalized_floor_sell_valid_to = least(
                      2147483647::NUMERIC,
                      coalesce(
                        nullif(date_part('epoch', upper(z.valid_between)), 'Infinity'),
                        0
                      )
                    )::INT,
                    normalized_floor_sell_source_id_int = z.source_id_int,
                    normalized_floor_sell_is_reservoir = z.is_reservoir,
                    updated_at = now()
              FROM (
                  SELECT
                    y.order_id,
                    y.value,
                    y.currency,
                    y.currency_value,
                    y.maker,
                    y.valid_between,
                    y.nonce,
                    y.source_id_int,
                    y.is_reservoir
                  FROM (
                    SELECT
                      token_sets_tokens.contract,
                      token_sets_tokens.token_id
                    FROM token_sets_tokens
                    WHERE token_sets_tokens.token_set_id = $/tokenSetId/
                  ) x LEFT JOIN LATERAL (
                    SELECT
                      orders.id AS order_id,
                      COALESCE(orders.normalized_value, orders."value") AS value,
                      orders.currency,
                      COALESCE(orders.currency_normalized_value, orders.currency_value) AS currency_value,
                      orders.maker,
                      orders.valid_between,
                      orders.source_id_int,
                      orders.nonce,
                      orders.is_reservoir
                    FROM orders
                    JOIN token_sets_tokens
                      ON orders.token_set_id = token_sets_tokens.token_set_id
                    WHERE token_sets_tokens.contract = x.contract
                      AND token_sets_tokens.token_id = x.token_id
                      AND orders.side = 'sell'
                      AND orders.fillability_status = 'fillable'
                      AND orders.approval_status = 'approved'
                      AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                    ORDER BY COALESCE(orders.normalized_value, orders."value"), orders."value", orders.fee_bps
                    LIMIT 1
                  ) y ON TRUE
              ) z
                  WHERE tokens.contract = $/contract/
                    AND tokens.token_id = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            tokenSetId,
          }
        );

        await addToQueue();
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
      // await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {}, { delay: 500 });
};
