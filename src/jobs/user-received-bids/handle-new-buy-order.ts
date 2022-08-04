import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

const QUEUE_NAME = "user-received-bids-handle-new-buy-order-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const BATCH_SIZE = 200;

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId, contract, tokenId } = job.data as HandleBuyOrderParams;

      let continuationFilter = "";

      if (contract && tokenId) {
        continuationFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
      }

      const order = await idb.oneOrNone(
        `
              SELECT
                orders.id,
                orders.token_set_id,
                orders.maker,
                orders.price,
                orders.value,
                orders.quantity_remaining,
                orders.valid_between,
                orders.expiration,
                orders.created_at
              FROM orders
              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
        { orderId }
      );

      const query = `
        WITH "z" AS (
          SELECT
            "y"."owner" as "address",
            "x"."contract",
            "x"."token_id",
            $/orderId/ AS order_id,
            $/orderCreatedAt/::TIMESTAMPTZ AS order_created_at,
            $/maker/::BYTEA AS maker,
            $/price/::NUMERIC(78, 0) AS price,
            $/value/::NUMERIC(78, 0) AS value,
            $/quantity/::NUMERIC(78, 0) AS quantity,
            $/validBetween/::TSTZRANGE AS valid_between,
            LEAST($/expiration/::TIMESTAMPTZ, now() - interval '24 hours') AS clean_at
          FROM (
            SELECT "tst"."contract", "tst"."token_id"
            FROM "token_sets_tokens" "tst"
            WHERE "token_set_id" = $/tokenSetId/
            ${continuationFilter}
            ORDER BY contract, token_id ASC
            LIMIT ${BATCH_SIZE}
          ) "x" LEFT JOIN LATERAL (
            SELECT
              "nb"."owner"
            FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
              AND "nb"."token_id" = "x"."token_id"
              AND "nb"."amount" > 0
          ) "y" ON TRUE
        ), y AS (
          INSERT INTO "user_received_bids" (
            address,
            contract,
            token_id,
            order_id,
            order_created_at,
            maker,
            price,
            value,
            quantity,
            valid_between,
            clean_at
          )
          SELECT * FROM z  
          ON CONFLICT DO NOTHING
          RETURNING *
        )
        SELECT contract, token_id
        FROM y
        ORDER BY contract, token_id DESC
        LIMIT 1
      `;

      const result = await idb.oneOrNone(query, {
        tokenSetId: order.token_set_id,
        orderId: order.id,
        orderCreatedAt: order.created_at,
        maker: order.maker,
        price: order.price,
        value: order.value,
        quantity: order.quantity_remaining,
        validBetween: order.valid_between,
        expiration: order.expiration,
      });

      if (!order.token_set_id.startsWith("token:") && result) {
        await addToQueue([
          {
            orderId,
            contract: fromBuffer(result.contract),
            tokenId: result.token_id,
          },
        ]);
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type HandleBuyOrderParams = {
  orderId: string;
  contract?: string | null;
  tokenId?: string | null;
};

export const addToQueue = async (buyOrders: HandleBuyOrderParams[]) => {
  await queue.addBulk(
    buyOrders.map((buyOrder) => ({
      name: buyOrder.orderId,
      data: buyOrder,
    }))
  );
};
