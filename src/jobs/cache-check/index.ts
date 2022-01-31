import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";

// Periodically check cache values against the underlying
// data backing those caches in order to ensure there are
// no inconsistencies between them. Some examples of what
// we might want to check:
// - tokens cached `top_buy` and `floor_sell`
// - token sets cached `top_buy`

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("cache_check_lock", 60 - 5);
    if (lockAcquired) {
      logger.info("cache_check", "Checking cache consistency");

      try {
        // Randomly check the tokens `floor_sell` caches
        {
          const results: { id: string; is_wrong: boolean }[] =
            await db.manyOrNone(
              `
                select * from (
                  select "c"."id"
                  from "collections" "c"
                  offset floor(random() * (select count(*) from collections))
                  limit 5
                ) "x"
                left join lateral (
                  with "w" as (
                    select
                      "t"."contract",
                      "t"."token_id",
                      "t"."floor_sell_value",
                      "y"."value"
                    from "tokens" "t"
                    left join lateral (
                      select
                        "o"."value"
                      from "orders" "o"
                      join "token_sets_tokens" "tst"
                        on "o"."token_set_id" = "tst"."token_set_id"
                      where "tst"."contract" = "t"."contract"
                        and "tst"."token_id" = "t"."token_id"
                        and "o"."status" = 'valid'
                        and "o"."side" = 'sell'
                      order by "o"."value"
                      limit 1
                    ) "y" on true
                    where "t"."collection_id" = "x"."id"
                    order by "t"."floor_sell_value"
                    limit 5
                  )
                  select exists(
                    select from "w" where "w"."floor_sell_value" != "w"."value"
                  ) as "is_wrong"
                ) "z" on true
              `
            );
          for (const { id, is_wrong } of results) {
            if (is_wrong) {
              logger.error(
                "cache_check",
                `Detected wrong "tokens_floor_sell" cache for collection ${id}`
              );
            }
          }
        }

        // Randomly check the tokens `top_buy` caches
        {
          const results: { id: string; is_wrong: boolean }[] =
            await db.manyOrNone(
              `
                select * from (
                  select "c"."id"
                  from "collections" "c"
                  offset floor(random() * (select count(*) from collections))
                  limit 5
                ) "x"
                left join lateral (
                  with "w" as (
                    select
                      "t"."contract",
                      "t"."token_id",
                      "t"."top_buy_value",
                      "y"."value"
                    from "tokens" "t"
                    left join lateral (
                      select
                        "o"."value"
                      from "orders" "o"
                      join "token_sets_tokens" "tst"
                        on "o"."token_set_id" = "tst"."token_set_id"
                      where "tst"."contract" = "t"."contract"
                        and "tst"."token_id" = "t"."token_id"
                        and "o"."status" = 'valid'
                        and "o"."side" = 'buy'
                        and exists(
                          select from "ownerships" "w"
                            where "w"."contract" = "t"."contract"
                            and "w"."token_id" = "t"."token_id"
                            and "w"."amount" > 0
                            and "w"."owner" != "o"."maker"
                        )
                      order by "o"."value" desc
                      limit 1
                    ) "y" on true
                    where "t"."collection_id" = "x"."id"
                    order by "t"."top_buy_value" desc
                    limit 5
                  )
                  select exists(
                    select from "w" where "w"."top_buy_value" != "w"."value"
                  ) as "is_wrong"
                ) "z" on true
              `
            );
          for (const { id, is_wrong } of results) {
            if (is_wrong) {
              logger.error(
                "cache_check",
                `Detected wrong "tokens_top_buy" cache for collection ${id}`
              );
            }
          }
        }
      } catch (error) {
        logger.error(
          "cache_check",
          `Failed to check cache consistency: ${error}`
        );
      }
    }
  });
}
