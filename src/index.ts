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
  if (process.env.FAKE_VAR) {
    try {
      let done = false;
      let i = 0;
      let collectionCont = "0xbbe23e96c48030dc5d4906e73c4876c254100d33";
      while (!done) {
        // eslint-disable-next-line no-console
        console.log(`iter ${i} - ${collectionCont}`);
        i++;
        const res = await idb.manyOrNone(
          `
      with x as (select y.* from collections c join lateral (SELECT
        'bootstrap'::token_floor_sell_event_kind_t, tokens.collection_id, tokens.contract, tokens.token_id, tokens.floor_sell_id,
        orders.source_id,       
        orders.source_id_int,   
        orders.valid_between, tokens.floor_sell_maker, tokens.floor_sell_value, null::numeric, null::bytea, null::int
      FROM tokens
      JOIN orders
        ON tokens.floor_sell_id = orders.id
      WHERE tokens.collection_id = c.id
      ORDER BY tokens.floor_sell_value
      LIMIT 1) y on true where c.id > $/collectionCont/ order by c.id limit 100),
      y as (update collections set floor_sell_id = x.floor_sell_id, floor_sell_value = x.floor_sell_value, floor_sell_maker = x.floor_sell_maker, floor_sell_source_id = x.source_id, floor_sell_source_id_int = x.source_id_int, floor_sell_valid_between = x.valid_between from x where id = x.collection_id and collections.floor_sell_id is distinct from x.floor_sell_id)
      insert into collection_floor_sell_events (kind, collection_id, contract,
        token_id,
    order_id,
    order_source_id,
    order_source_id_int,
    order_valid_between,
    maker,              
    price,              
    previous_price,
    tx_hash,
    tx_timestamp) select * from x returning collection_id
      `,
          { collectionCont }
        );

        if (res && res.length >= 100) {
          collectionCont = res[res.length - 1].collection_id;
        } else {
          done = true;
        }
      }
    } catch (error) {
      logger.info("debug", `Error ${error}`);
    }
  }
};

main();

start();
