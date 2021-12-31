import { Common } from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

// Whenever an order changes its state (eg. a new order comes in,
// a fill/cancel happens, an order gets expired or an order gets
// revalidated/invalidated due to a token balance change), we might
// want to take some actions (eg. update any cached state, like
// a token's floor sell value or top buy value). Any such actions
// are all performed in here.

// As for events syncing we have two separate job queues. One is for
// handling direct order state changes (eg. cancel/fill/expiration -
// where we know exactly the hashes of the affected orders), while
// the other one is used for indirect state changes (eg. the balance
// of an order's maker changes - where we don't know exactly the hashes
// of the affected orders and some additional processing has to be done
// in order to find those).

// By hash

const BY_HASH_JOB_NAME = "orders_update_by_hash";

const byHashQueue = new Queue(BY_HASH_JOB_NAME, {
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
new QueueScheduler(BY_HASH_JOB_NAME, { connection: redis });

export type HashInfo = {
  hash: string;
};

export const addToOrdersUpdateByHashQueue = async (hashInfos: HashInfo[]) => {
  // Ignore null hashes
  hashInfos = hashInfos.filter(
    ({ hash }) =>
      hash !==
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  );

  await byHashQueue.addBulk(
    hashInfos.map((hashInfo) => ({
      name: hashInfo.hash,
      data: hashInfo,
      opts: {
        // Since it can happen to sync and handle the same events more
        // than once, we should make sure not to do any expensive work
        // more than once for the same event. As such, we keep the last
        // performed jobs in the queue (via the above `removeOnComplete`
        // option) and give the jobs a deterministic id so that a job
        // will not be re-executed if it already did recently.
        jobId: hashInfo.hash,
        removeOnComplete: 1000,
      },
    }))
  );
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    BY_HASH_JOB_NAME,
    async (job: Job) => {
      const { hash } = job.data;

      try {
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
              where "o"."hash" = $/hash/
            `,
            { hash }
          );

        // Recompute floor_sell_hash or top_buy_hash for targeted tokens.
        // TODO: An optimization of this would only recompute in certain
        // cases (eg. only recompute for tokens that have the floor_sell_hash
        // or top_buy_hash filled/cancelled/expired or for tokens that have
        // the floor_sell_value or top_buy_value less/higher than an incoming
        // order).
        const queries: any[] = [];
        for (const { side, contract, tokenId } of data) {
          logger.info(
            BY_HASH_JOB_NAME,
            `Recomputing cached ${side} data for (${contract}, ${tokenId})`
          );

          if (side === "sell") {
            queries.push({
              query: `
                update "tokens" as "t" set
                  "floor_sell_hash" = "x"."hash",
                  "floor_sell_value" = "x"."value"
                from (
                  select
                    max("y"."hash") as "hash",
                    max("y"."value") as "value"
                  from (
                    select "o"."hash", "o"."value" from "orders" "o"
                    join "token_sets_tokens" "tst"
                      on "o"."token_set_id" = "tst"."token_set_id"
                    join "ownerships" "w"
                      on "o"."maker" = "w"."owner"
                      and "tst"."contract" = "w"."contract"
                      and "tst"."token_id" = "w"."token_id"
                    where "tst"."contract" = $/contract/
                      and "tst"."token_id" = $/tokenId/
                      and "o"."valid_between" @> now()
                      and "o"."side" = 'sell'
                      and "o"."status" = 'valid'
                      and "w"."amount" > 0
                    order by "o"."value" asc
                    limit 1
                  ) "y"
                ) "x"
                where "contract" = $/contract/
                  and "token_id" = $/tokenId/
                  and "t"."floor_sell_hash" is distinct from "x"."hash"
              `,
              values: {
                contract,
                tokenId,
              },
            });
          } else if (side === "buy") {
            queries.push({
              query: `
                update "tokens" as "t" set
                  "top_buy_hash" = "x"."hash",
                  "top_buy_value" = "x"."value"
                from (
                  select
                    max("y"."hash") as "hash",
                    max("y"."value") as "value"
                  from (
                    select "o"."hash", "o"."value" from "orders" "o"
                    join "token_sets_tokens" "tst"
                      on "o"."token_set_id" = "tst"."token_set_id"
                    join "ownerships" "w"
                      on "o"."maker" = "w"."owner"
                    where "tst"."contract" = $/contract/
                      and "tst"."token_id" = $/tokenId/
                      and "o"."valid_between" @> now()
                      and "o"."side" = 'buy'
                      and "o"."status" = 'valid'
                      and "w"."amount" >= "o"."price"
                      and "w"."contract" = $/weth/
                      and "w"."token_id" = -1
                    order by "o"."value" desc
                    limit 1
                  ) "y"
                ) "x"
                where "contract" = $/contract/
                  and "token_id" = $/tokenId/
                  and "t"."top_buy_hash" is distinct from "x"."hash"
              `,
              values: {
                // We only support eth/weth as payment
                weth: Common.Addresses.Weth[config.chainId],
                contract,
                tokenId,
              },
            });
          }
        }

        if (queries.length) {
          await db.none(pgp.helpers.concat(queries));
        }
      } catch (error) {
        logger.error(BY_HASH_JOB_NAME, `Failed to handle ${hash}: ${error}`);
        throw error;
      }
    },
    { connection: redis }
  );
  worker.on("error", (error) => {
    logger.error(BY_HASH_JOB_NAME, `Worker errored: ${error}`);
  });
}

// By maker

const BY_MAKER_JOB_NAME = "orders_update_by_maker";

const byMakerQueue = new Queue(BY_MAKER_JOB_NAME, {
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
new QueueScheduler(BY_MAKER_JOB_NAME, { connection: redis });

export type MakerInfo = {
  txHash: string;
  side: "buy" | "sell";
  maker: string;
  contract: string;
  tokenId?: string;
};

export const addToOrdersUpdateByMakerQueue = async (
  makerInfos: MakerInfo[]
) => {
  // Ignore null addresses
  makerInfos = makerInfos.filter(
    ({ maker }) => maker !== "0x0000000000000000000000000000000000000000"
  );

  await byMakerQueue.addBulk(
    makerInfos.map((makerInfo) => ({
      name: makerInfo.maker,
      data: makerInfo,
      opts: {
        // Since it can happen to sync and handle the same events more
        // than once, we should make sure not to do any expensive work
        // more than once for the same event. As such, we keep the last
        // performed jobs in the queue (via the above `removeOnComplete`
        // option) and give the jobs a deterministic id so that a job
        // will not be re-executed if it already did recently.
        jobId: makerInfo.txHash + makerInfo.maker,
        removeOnComplete: 1000,
      },
    }))
  );
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    BY_MAKER_JOB_NAME,
    async (job: Job) => {
      const { side, maker, contract, tokenId } = job.data;

      try {
        let hashes: { hash: string; status: string }[] = [];

        if (side === "buy") {
          hashes = await db.manyOrNone(
            `
              select
                "o"."hash",
                (case
                  when "w"."amount" >= "o"."price" then 'valid'
                  else 'no-balance'
                end)::order_status_t as "status"
              from "orders" "o"
              join "ownerships" "w"
                on "o"."maker" = "w"."owner"
              where "o"."side" = 'buy'
                and "o"."valid_between" @> now()
                and ("o"."status" = 'valid' or "o"."status" = 'no-balance')
                and "w"."owner" = $/maker/
                and "w"."contract" = $/weth/
                and "w"."token_id" = -1
            `,
            {
              maker,
              // We only support eth/weth as payment
              weth: Common.Addresses.Weth[config.chainId],
            }
          );
        } else if (side === "sell") {
          hashes = await db.manyOrNone(
            `
              select
                "o"."hash",
                (case
                  when "w"."amount" > 0 then 'valid'
                  else 'no-balance'
                end)::order_status_t as "status"
              from "orders" "o"
              join "ownerships" "w"
                on "o"."maker" = "w"."owner"
              join "token_sets_tokens" "tst"
                on "o"."token_set_id" = "tst"."token_set_id"
                and "w"."contract" = "tst"."contract"
                and "w"."token_id" = "tst"."token_id"
              where "o"."side" = 'sell'
                and "o"."valid_between" @> now()
                and ("o"."status" = 'valid' or "o"."status" = 'no-balance')
                and "w"."owner" = $/maker/
                and "w"."contract" = $/contract/
                and "w"."token_id" = $/tokenId/
            `,
            {
              maker,
              contract,
              tokenId,
            }
          );
        }

        if (hashes.length) {
          const columns = new pgp.helpers.ColumnSet(["hash", "status"], {
            table: "orders",
          });
          const values = pgp.helpers.values(hashes, columns);
          await db.none(`
            update "orders" as "o" set "status" = "x"."status"::order_status_t
            from (values ${values}) as "x"("hash", "status")
            where "o"."hash" = "x"."hash"::text
              and ("o"."status" = 'valid' or "o"."status" = 'no-balance')
              and "o"."status" != "x"."status"::order_status_t
          `);
        }

        await addToOrdersUpdateByHashQueue(hashes);
      } catch (error) {
        logger.error(
          BY_MAKER_JOB_NAME,
          `Failed to handle { ${side}, ${maker}, ${contract}, ${tokenId} }: ${error}`
        );
        throw error;
      }
    },
    { connection: redis }
  );
  worker.on("error", (error) => {
    logger.error(BY_MAKER_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Orders might expire anytime, without us getting notified.
// For this reason, every once in a while, in order to stay
// up-to-date, we have to do a cleanup by fetching all orders
// that expired an marking them as such.

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  if (config.acceptOrders) {
    cron.schedule("*/1 * * * *", async () => {
      const lockAcquired = await acquireLock("expired_orders_lock", 55);
      if (lockAcquired) {
        logger.info("expired_orders_cron", "Invalidating expired orders");

        try {
          const hashes: { hash: string }[] = await db.manyOrNone(
            `
              update "orders" set "status" = 'expired'
              where not "valid_between" @> now()
                and ("status" = 'valid' or "status" = 'no-balance')
              returning "hash"
            `
          );

          await addToOrdersUpdateByHashQueue(hashes);
        } catch (error) {
          logger.error(
            "expired_orders_cron",
            `Failed to handle expired orders: ${error}`
          );
        }
      }
    });
  }
}
