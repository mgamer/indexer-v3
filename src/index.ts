import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { db } from "./common/db";

const foo = async () => {
  const collections = await db.manyOrNone(
    "select id, contract, lower(token_id_range), upper(token_id_range) from collections where id >= '0x4a5fa827f409ad245a29824fba3cbc19ee9cc186'"
  );
  for (let i = 0; i < collections.length; i++) {
    console.log(i, collections[i].id);
    const tokenIdRange =
      collections[i].lower && collections[i].upper
        ? `numrange(${collections[i].lower}, ${collections[i].upper}, '[]')`
        : `'(,)'::numrange`;
    await db.none(
      `
        update tokens set collection_id = $/id/
        where contract = $/contract/
          and token_id <@ $/tokenIdRange:raw/
      `,
      { id: collections[i].id, contract: collections[i].contract, tokenIdRange }
    );
  }
};
foo().catch((error) => console.error(`Error: ${error}`));

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

start();
