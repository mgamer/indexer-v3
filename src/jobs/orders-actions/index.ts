import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { batchQueries, db } from "@common/db";
import { logger } from "@common/logger";
import { acquireLock, redis, releaseLock } from "@common/redis";
import { config } from "@config/index";

// Whenever any order state changes (eg. a new order comes in,
// a fill/cancel happens, or an order gets expired), we might
// want to take some actions (eg. update any cached state, like
// a token's floor sell price or top buy price). These actions
// are all performed in here.

const JOB_NAME = "orders_actions";

const queue = new Queue(JOB_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(JOB_NAME, { connection: redis });

export const addToOrdersActionsQueue = async (orderHashes: string[]) => {
  await queue.addBulk(
    orderHashes.map((orderHash) => ({
      name: orderHash,
      data: { orderHash },
    }))
  );
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { orderHash } = job.data;

      // Get all tokens targeted by the order
      const data: { side: string; contract: string; tokenId: string }[] =
        await db.manyOrNone(
          `
            select
              "o"."side",
              "tst"."contract",
              "tst"."token_id" as "tokenId"
            from "token_sets_tokens" "tst"
            join "orders" "o" on "tst"."token_set_id" = "o"."token_set_id"
            where "o"."hash" = $/orderHash/
          `,
          { orderHash }
        );

      // Recompute floor_sell_hash or top_buy_hash for targeted tokens
      const queries: any[] = [];
      for (const { side, contract, tokenId } of data) {
        if (side === "sell") {
          queries.push({
            query: `
              update "tokens" set
                "floor_sell_hash" = "x"."hash",
                "floor_sell_price" = "x"."price"
              from (
                select "hash", "price" from "orders" "o"
                join "token_sets_tokens" "tst" on "o"."token_set_id" = "tst"."token_set_id"
                where "tst"."contract" = $/contract/
                  and "tst"."token_id" = $/tokenId/
                  and "o"."valid_between" @> now()
                  and "side" = 'sell'
                  and "status" = 'valid'
                order by "o"."price" asc
                limit 1
              ) "x"
              where "contract" = $/contract/ and "token_id" = $/tokenId/
            `,
            values: {
              contract,
              tokenId,
            },
          });
        } else if (side === "buy") {
          queries.push({
            query: `
              update "tokens" set
                "top_buy_hash" = "x"."hash",
                "top_buy_price" = "x"."price"
              from (
                select "hash", "price" from "orders" "o"
                join "token_sets_tokens" "tst" on "o"."token_set_id" = "tst"."token_set_id"
                where "tst"."contract" = $/contract/
                  and "tst"."token_id" = $/tokenId/
                  and "o"."valid_between" @> now()
                  and "side" = 'buy'
                  and "status" = 'valid'
                order by "o"."price" desc
                limit 1
              ) "x"
              where "contract" = $/contract/ and "token_id" = $/tokenId/
            `,
            values: {
              contract,
              tokenId,
            },
          });
        }
      }

      await batchQueries(queries);
    },
    { connection: redis }
  );
  worker.on("error", (error) => {
    logger.error(JOB_NAME, `Worker errored: ${error}`);
  });

  // Every once in a while make sure to check and invalidate
  // orders that expired

  cron.schedule("*/1 * * * *", async () => {
    if (await acquireLock("order_actions_lock", 55)) {
      logger.info("orders_actions_cron", "Invalidating expired orders");

      const expiredHashes: { hash: string }[] = await db.manyOrNone(
        `
          update "orders" set "status" = 'expired'
          where not "valid_between" @> now()
            and "status" = 'valid'
          returning "hash"
        `
      );

      console.log(`Checking ${expiredHashes.length} expirations`);
      await addToOrdersActionsQueue(expiredHashes.map(({ hash }) => hash));

      await releaseLock("order_actions_lock");
    }
  });

  // TODO: Handle transfers
}
