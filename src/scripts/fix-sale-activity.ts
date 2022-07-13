/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import _ from "lodash";
import { idb } from "@/common/db";

const main = async () => {
  let id = 233303219;
  const maxActivitiesId = 233557401;
  const maxUserActivitiesId = 333702983;
  const limit = 3000;

  while (id < maxActivitiesId) {
    const results = await fixTable("activities", id, limit);
    const newMaxId = _.maxBy(results, (result) => result.id);
    id = newMaxId ? newMaxId.id : id + limit;
    console.log(`activities - ${id}`);
  }

  id = 330133791;

  while (id < maxUserActivitiesId) {
    const results = await fixTable("user_activities", id, limit);
    const newMaxId = _.maxBy(results, (result) => result.id);
    id = newMaxId ? newMaxId.id : id + limit;
    console.log(`user_activities - ${id}`);
  }
};

async function fixTable(table: string, id: number, limit: number) {
  const query = `
      UPDATE ${table}
      SET from_address = z.taker, to_address = z.maker, metadata = metadata || jsonb_build_object('orderId', order_id)
      FROM (
          SELECT id, "orderId", maker, taker, COALESCE(order_id, '') AS order_id
          FROM (
              SELECT id, (metadata->'logIndex')::INTEGER AS "logIndex", (metadata->>'batchIndex')::INTEGER AS "batchIndex", REPLACE((metadata->>'transactionHash'), '0x', '\\x') AS "transactionHash",
                     (metadata->>'orderId') AS "orderId"
              FROM ${table}
              WHERE type = 'sale'
              AND id > ${id}
              ORDER BY id ASC
              LIMIT ${limit}
          ) x
          JOIN fill_events_2 ON x."logIndex" = fill_events_2.log_index AND x."batchIndex" = fill_events_2.batch_index AND x."transactionHash" = fill_events_2.tx_hash::TEXT
          AND order_side = 'buy'
          AND "orderId" IS NULL
          ORDER BY id ASC
      ) z
      WHERE ${table}.id = z.id
      RETURNING ${table}.id
    `;

  return await idb.manyOrNone(query);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
