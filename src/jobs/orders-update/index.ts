import { AddressZero, HashZero } from "@ethersproject/constants";
import { Common } from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

// Whenever an order changes its state (eg. a new order comes in,
// a fill/cancel happens, an order gets expired or an order gets
// revalidated/invalidated due to balance change), we might want
// to take some actions (eg. update any cached state). Any such
// actions are all to be performed via the "orders-update" jobs.

// As for events syncing we have two separate job queues. The first
// one is for handling direct order state changes (eg. cancel/fill/
// expiration - where we know exactly the hashes of the orders that
// are affected), while the other one is for indirect state changes
// - where we don't exactly know the hashes of the affected orders
// and some additional processing has to be done for finding these
// (eg. on balance changes many of the owner's orders might change
// their state so we have to check all of them).

// By hash

const BY_HASH_JOB_NAME = "orders_update_by_hash";

const byHashQueue = new Queue(BY_HASH_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnFail: true,
  },
});
new QueueScheduler(BY_HASH_JOB_NAME, { connection: redis.duplicate() });

export type HashInfo = {
  // The context will ensure the queue won't process the same job more
  // than once in the same context (over a recent time period)
  context: string;
  hash: string;
};

export const addToOrdersUpdateByHashQueue = async (hashInfos: HashInfo[]) => {
  // Ignore null hashes
  hashInfos = hashInfos.filter(({ hash }) => hash !== HashZero);

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
        jobId: hashInfo.context + "-" + hashInfo.hash,
      },
    }))
  );
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${BY_HASH_JOB_NAME}_queue_clean_lock`,
      60 - 5
    );
    if (lockAcquired) {
      // Clean up jobs older than 10 minutes
      await byHashQueue.clean(10 * 60 * 1000, 100000);
    }
  });
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    BY_HASH_JOB_NAME,
    async (job: Job) => {
      const { hash } = job.data;

      try {
        const data: {
          side: string;
          token_set_id: string;
        } | null = await db.oneOrNone(
          `
            select
              "o"."side",
              "o"."token_set_id"
            from "orders" "o"
            where "o"."hash" = $/hash/
              and "o"."side" is not null
              and "o"."token_set_id" is not null
          `,
          { hash }
        );

        if (data) {
          const side = data.side;
          const tokenSetId = data.token_set_id;

          logger.info(
            BY_HASH_JOB_NAME,
            `Recomputing cached ${side} data given token set ${tokenSetId}`
          );

          // Recompute `top_buy` for token sets that are not single token
          if (side === "buy" && !tokenSetId.startsWith("token")) {
            await db.none(
              `
                with "x" as (
                  select
                    "o"."token_set_id",
                    "o"."hash",
                    "o"."value"
                  from "orders" "o"
                  where "o"."token_set_id" = $/tokenSetId/
                    and "o"."side" = 'buy'
                    and "o"."status" = 'valid'
                  order by "o"."value" desc
                  limit 1
                )
                update "token_sets" as "ts" set
                  "top_buy_hash" = "x"."hash",
                  "top_buy_value" = "x"."value"
                from "x"
                where "ts"."id" = "x"."token_set_id"
                  and "ts"."top_buy_hash" is distinct from "x"."hash"
              `,
              { tokenSetId }
            );
          }

          // Recompute `top_buy` and `floor_sell` for single tokens
          await db.none(
            `
              with "z" as (
                select
                  "x"."contract",
                  "x"."token_id",
                  "o"."hash",
                  "o"."value"
                from (
                  select
                    "tst"."contract",
                    "tst"."token_id"
                  from "orders" "o"
                  join "token_sets_tokens" "tst"
                    on "o"."token_set_id" = "tst"."token_set_id"
                  where "o"."hash" = $/hash/
                ) "x" left join lateral (
                  select
                    "o"."hash",
                    "o"."value"
                  from "orders" "o"
                  join "token_sets_tokens" "tst"
                    on "o"."token_set_id" = "tst"."token_set_id"
                  where "tst"."contract" = "x"."contract"
                    and "tst"."token_id" = "x"."token_id"
                    and "o"."side" = '${side}'
                    and "o"."status" = 'valid'
                  order by value ${side === "sell" ? "asc" : "desc"} nulls last
                  limit 1
                ) "y" on true
              )
              update "tokens" as "t" set
                "${
                  side === "sell" ? "floor_sell_hash" : "top_buy_hash"
                }" = "z"."hash",
                "${
                  side === "sell" ? "floor_sell_value" : "top_buy_value"
                }" = "z"."value"
              where "t"."contract" = "z"."contract"
                and "t"."token_id" = "z"."token_id"
            `,
            { hash }
          );
        }
      } catch (error) {
        logger.error(BY_HASH_JOB_NAME, `Failed to handle ${hash}: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(BY_HASH_JOB_NAME, `Worker errored: ${error}`);
  });
}

// By maker

const BY_MAKER_JOB_NAME = "orders_update_by_maker";

const byMakerQueue = new Queue(BY_MAKER_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnFail: true,
  },
});
new QueueScheduler(BY_MAKER_JOB_NAME, { connection: redis.duplicate() });

export type MakerInfo = {
  // The context will ensure the queue won't process the same job more
  // than once in the same context (over a recent time period)
  context: string;
  side: "buy" | "sell";
  maker: string;
  contract: string;
  tokenId?: string;
};

export const addToOrdersUpdateByMakerQueue = async (
  makerInfos: MakerInfo[]
) => {
  // Ignore null addresses
  makerInfos = makerInfos.filter(({ maker }) => maker !== AddressZero);

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
        jobId: makerInfo.context + "-" + makerInfo.maker,
      },
    }))
  );
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${BY_MAKER_JOB_NAME}_queue_clean_lock`,
      60 - 5
    );
    if (lockAcquired) {
      // Clean up jobs older than 10 minutes
      await byMakerQueue.clean(10 * 60 * 1000, 100000);
    }
  });
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    BY_MAKER_JOB_NAME,
    async (job: Job) => {
      const { context, side, maker, contract, tokenId } = job.data;

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

        await addToOrdersUpdateByHashQueue(
          hashes.map(({ hash }) => ({ context, hash }))
        );
      } catch (error) {
        logger.error(
          BY_MAKER_JOB_NAME,
          `Failed to handle { ${side}, ${maker}, ${contract}, ${tokenId} }: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(BY_MAKER_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Orders might expire anytime, without us getting notified.
// For this reason, every once in a while, in order to stay
// up-to-date, we have to do a cleanup by fetching all orders
// that expired an marking them as such.

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.acceptOrders) {
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

        await addToOrdersUpdateByHashQueue(
          hashes.map(({ hash }) => ({
            context: Math.floor(Date.now() / 1000).toString(),
            hash,
          }))
        );
      } catch (error) {
        logger.error(
          "expired_orders_cron",
          `Failed to handle expired orders: ${error}`
        );
      }
    }
  });
}
