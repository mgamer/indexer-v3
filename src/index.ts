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

const tmp = async () => {
  if (process.env.TMP === "tmp") {
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-console
      console.log(`Executed ${i * 100}`);
      i++;
      const result = await idb.manyOrNone(
        `with x as (select id, decode(substring(split_part(token_set_id, ':', 2) from 3), 'hex') as contract from orders where token_set_id is not null and contract is null limit 100) update orders set contract = x.contract from x where orders.id = x.id returning 1`
      );
      if (result.length < 100) {
        break;
      }
    }
  }
};
tmp();

start();
