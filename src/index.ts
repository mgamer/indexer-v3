import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { idb } from "./common/db";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

const main = async () => {
  if (!process.env.MASTER) {
    return;
  }

  try {
    let floorSellId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let done = false;
    let i = 0;
    while (!done) {
      // eslint-disable-next-line no-console
      console.log(`${i++}`);
      const result = await idb.manyOrNone(
        `
          WITH x AS (
            SELECT
              tokens.contract,
              tokens.token_id,
              tokens.floor_sell_id,
              least(
                2147483647::NUMERIC,
                date_part('epoch', lower(orders.valid_between))
              )::INT AS floor_sell_valid_from,
              least(
                2147483647::NUMERIC,
                coalesce(
                  nullif(date_part('epoch', upper(orders.valid_between)), 'Infinity'),
                  0
                )
              )::INT AS floor_sell_valid_to,
              orders.source_id,
              orders.source_id_int,
              orders.is_reservoir
            FROM tokens
            LEFT JOIN orders
              ON tokens.floor_sell_id = orders.id
            WHERE tokens.floor_sell_id > $/floorSellId/
              AND tokens.floor_sell_id IS NOT NULL
              AND tokens.floor_sell_source_id IS NULL
            ORDER BY tokens.floor_sell_id
            LIMIT 100
          )
          UPDATE tokens SET
            floor_sell_valid_from = x.floor_sell_valid_from,
            floor_sell_valid_to = x.floor_sell_valid_to,
            floor_sell_source_id = x.source_id,
            floor_sell_source_id_int = x.source_id_int,
            floor_sell_is_reservoir = x.is_reservoir
          FROM x
          WHERE tokens.contract = x.contract
            AND tokens.token_id = x.token_id
          RETURNING tokens.floor_sell_id
        `,
        { floorSellId }
      );

      if (result && result.length >= 100) {
        floorSellId = result[result.length - 1].floor_sell_id;
      } else {
        done = true;
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
};

main();

start();
