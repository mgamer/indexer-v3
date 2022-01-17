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

export const byHashQueue = new Queue(BY_HASH_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    // We should make sure not to perform any expensive work more
    // than once. As such, we keep the last performed jobs in the
    // queue and give jobs a deterministic id so that it will not
    // get re-executed if it already did recently.
    removeOnComplete: 100000,
    removeOnFail: 100000,
  },
});
new QueueScheduler(BY_HASH_JOB_NAME, { connection: redis.duplicate() });

export type HashInfo = {
  // The deterministic context/event that triggered the job
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
        jobId: hashInfo.context + "-" + hashInfo.hash,
      },
    }))
  );
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // TODO: Check if cleaning the queue is indeed required
  cron.schedule("*/10 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${BY_HASH_JOB_NAME}_queue_clean_lock`,
      10 * 60 - 5
    );
    if (lockAcquired) {
      // Clean up jobs older than 10 minutes
      await byHashQueue.clean(10 * 60 * 1000, 100000, "completed");
      await byHashQueue.clean(10 * 60 * 1000, 100000, "failed");
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
          side: string | null;
          token_set_id: string | null;
        } | null = await db.oneOrNone(
          `
            select
              "o"."side",
              "o"."token_set_id"
            from "orders" "o"
            where "o"."hash" = $/hash/
          `,
          { hash }
        );

        if (data && data.side && data.token_set_id) {
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
          const column = data.side === "sell" ? "floor_sell" : "top_buy";
          await db.none(
            `
              with "z" as (
                select
                  "x"."contract",
                  "x"."token_id",
                  "y"."hash",
                  "y"."value"
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
                "${column}_hash" = "z"."hash",
                "${column}_value" = "z"."value"
              from "z"
              where "t"."contract" = "z"."contract"
                and "t"."token_id" = "z"."token_id"
                and "t"."${column}_hash" is distinct from "z"."hash"
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

export const byMakerQueue = new Queue(BY_MAKER_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    // We should make sure not to perform any expensive work more
    // than once. As such, we keep the last performed jobs in the
    // queue and give jobs a deterministic id so that it will not
    // get re-executed if it already did recently.
    removeOnComplete: 100000,
    removeOnFail: 100000,
  },
});
new QueueScheduler(BY_MAKER_JOB_NAME, { connection: redis.duplicate() });

export type MakerInfo = {
  // The deterministic context/event that triggered the job
  context: string;
  side: "buy" | "sell";
  maker: string;
  contract: string;
  // The token id will be missing for `buy` orders
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
        jobId: makerInfo.context + "-" + makerInfo.maker,
      },
    }))
  );
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // TODO: Check if cleaning the queue is indeed required
  cron.schedule("*/10 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${BY_MAKER_JOB_NAME}_queue_clean_lock`,
      10 * 60 - 5
    );
    if (lockAcquired) {
      // Clean up jobs older than 10 minutes
      await byMakerQueue.clean(10 * 60 * 1000, 100000, "completed");
      await byMakerQueue.clean(10 * 60 * 1000, 100000, "failed");
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
        let orderStatuses: {
          hash: string;
          old_status: string;
          new_status: string;
        }[] = [];

        if (side === "buy") {
          orderStatuses = await db.manyOrNone(
            `
              select
                "o"."hash",
                "o"."status" as "old_status",
                (case
                  when "w"."amount" >= "o"."price" then 'valid'
                  else 'no-balance'
                end)::order_status_t as "new_status"
              from "orders" "o"
              join "ownerships" "w"
                on "o"."maker" = "w"."owner"
              where "o"."maker" = $/maker/
                and "o"."side" = 'buy'
                and ("o"."status" = 'valid' or "o"."status" = 'no-balance')
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
          orderStatuses = await db.manyOrNone(
            `
              select
                "o"."hash",
                "o"."status" as "old_status",
                (case
                  when "w"."amount" > 0 then 'valid'
                  else 'no-balance'
                end)::order_status_t as "new_status"
              from "orders" "o"
              join "ownerships" "w"
                on "o"."maker" = "w"."owner"
              join "token_sets_tokens" "tst"
                on "o"."token_set_id" = "tst"."token_set_id"
                and "w"."contract" = "tst"."contract"
                and "w"."token_id" = "tst"."token_id"
              where "o"."maker" = $/maker/
                and "o"."side" = 'sell'
                and ("o"."status" = 'valid' or "o"."status" = 'no-balance')
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

        // Filter out orders which have the same status as before
        orderStatuses = orderStatuses.filter(
          ({ old_status, new_status }) => old_status !== new_status
        );

        if (orderStatuses.length) {
          const columns = new pgp.helpers.ColumnSet(["hash", "status"], {
            table: "orders",
          });
          const values = pgp.helpers.values(
            orderStatuses.map(({ hash, new_status }) => ({
              hash,
              status: new_status,
            })),
            columns
          );

          await db.none(
            `
              update "orders" as "o" set
                "status" = "x"."status"::order_status_t
              from (values ${values}) as "x"("hash", "status")
              where "o"."hash" = "x"."hash"::text
            `
          );
        }

        // Re-check all affected orders
        await addToOrdersUpdateByHashQueue(
          orderStatuses.map(({ hash }) => ({ context, hash }))
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
// up-to-date, we check and invalidate orders that expired.

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.acceptOrders) {
  const CRON_NAME = "expired_orders";
  cron.schedule("*/30 * * * * *", async () => {
    const lockAcquired = await acquireLock(`${CRON_NAME}_lock`, 30 - 5);
    if (lockAcquired) {
      logger.info(`${CRON_NAME}_cron`, "Invalidating expired orders");

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
            context: `${CRON_NAME}_${Math.floor(Date.now() / 1000)}`,
            hash,
          }))
        );
      } catch (error) {
        logger.error(
          `${CRON_NAME}_cron`,
          `Failed to handle expired orders: ${error}`
        );
      }
    }
  });
}
