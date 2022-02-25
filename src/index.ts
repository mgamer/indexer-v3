import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { db } from "./common/db";
import { addToQueue } from "./jobs/order-updates/by-id-queue";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

const foo = async () => {
  let done = false;
  let i = 0;
  while (!done) {
    console.log(i++);
    const results = await db.manyOrNone(
      `
        update "orders" as "o"
        set "fillability_status" = 'cancelled'
        from (
          select "id" from "orders"
          where "kind" = 'wyvern-v2'
            and ("fillability_status" = 'fillable' or "fillability_status" = 'no-balance')
          limit 100
        ) "x"
        where "o"."id" = "x"."id"
        returning "o"."id"
      `
    );
    await addToQueue(
      results.map(({ id }) => ({ context: `cancelled-${id}`, id }))
    );

    if (results.length < 100) {
      done = true;
    }
  }
};
foo();

start();
