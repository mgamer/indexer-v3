import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import crypto from "crypto";
import PgPromise from "pg-promise";

const getRandomInt = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const main = async () => {
  // Setup database connection
  const pgp = PgPromise();
  const db = pgp({
    connectionString: process.env.DATABASE_URL,
  });

  const contracts = [
    "0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7",
    "0x8db687aceb92c66f013e1d614137238cc698fedb",
    "0x7afe30cb3e53dba6801aa0ea647a0ecea7cbe18d",
    "0x9b51a88cffe9b50e043661ddd7f492cc3888fcbf",
    "0xf4b6040a4b1b30f1d1691699a8f3bf957b03e463",
    "0x1dfe7ca09e99d10835bf73044a23b73fc20623df",
    "0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63",
    "0x448f3219cf2a23b0527a7a0158e7264b87f635db",
    "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
    "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623",
    "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
    "0x22c36bfdcef207f9c0cc941936eff94d4246d14a",
    "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
    "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270",
    "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6",
  ];

  // contracts
  {
    console.log("contracts");

    const toInsert: any[] = [];
    for (const contract of contracts) {
      toInsert.push({
        query: `INSERT INTO "contracts"("address", "schema") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        values: [contract, getRandomInt(0, 1) === 0 ? "ERC721" : "ERC1155"],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // tokens
  {
    console.log("tokens");

    for (const contract of contracts) {
      const toInsert: any[] = [];
      for (let i = 1; i <= 50000; i++) {
        toInsert.push({
          query: `INSERT INTO "tokens"("contract", "token_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          values: [contract, i],
        });
      }
      await db.none(pgp.helpers.concat(toInsert));
    }
  }

  const categories: string[] = [];
  for (let i = 1; i <= 2000; i++) {
    categories.push(`category${i}`);
  }

  const keys: string[] = [];
  for (let i = 1; i <= 2000; i++) {
    keys.push(`key${i}`);
  }

  const values: string[] = [];
  for (let i = 1; i <= 2000; i++) {
    values.push(`value${i}`);
  }

  // attributes
  {
    console.log("attributes");

    const toInsert: any[] = [];
    for (let i = 1; i <= 20000; i++) {
      toInsert.push({
        query: `INSERT INTO "attributes"("category", "key", "value") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        values: [
          categories[getRandomInt(0, categories.length - 1)],
          keys[getRandomInt(0, keys.length - 1)],
          values[getRandomInt(0, values.length - 1)],
        ],
      });
    }
    for (let i = 0; i < contracts.length; i++) {
      toInsert.push({
        query: `INSERT INTO "attributes"("category", "key", "value") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        values: ["global", "collection", `collection${i}`],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // tokens_attributes
  {
    console.log("tokens_attributes");

    const toInsert: any[] = [];
    for (let i = 1; i <= 100000; i++) {
      toInsert.push({
        query: `INSERT INTO "tokens_attributes"("contract", "token_id", "attribute_id") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        values: [
          contracts[getRandomInt(0, contracts.length - 1)],
          getRandomInt(1, 50000),
          getRandomInt(1, 20000),
        ],
      });
    }
    for (let i = 0; i < contracts.length; i++) {
      for (let j = 1; j <= 100; j++) {
        toInsert.push({
          query: `INSERT INTO "tokens_attributes"("contract", "token_id", "attribute_id") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          values: [contracts[i], j, 20000 + i + 1],
        });
      }
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // views
  {
    console.log("views");

    const toInsert: any[] = [];
    for (let i = 1; i <= 100; i++) {
      toInsert.push({
        query: `INSERT INTO "views"("label") VALUES ($1) ON CONFLICT DO NOTHING`,
        values: [crypto.randomBytes(16).toString("hex")],
      });
    }
    for (let i = 0; i < contracts.length; i++) {
      toInsert.push({
        query: `INSERT INTO "views"("label") VALUES ($1)`,
        values: [crypto.randomBytes(16).toString("hex")],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // views_attributes
  {
    console.log("views_attributes");

    const toInsert: any[] = [];
    for (let i = 1; i <= 100; i++) {
      toInsert.push({
        query: `INSERT INTO "views_attributes"("view_id", "attribute_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        values: [i, getRandomInt(1, 20000)],
      });
    }
    for (let i = 0; i < contracts.length; i++) {
      toInsert.push({
        query: `INSERT INTO "views_attributes"("view_id", "attribute_id") VALUES ($1, $2)`,
        values: [100 + i + 1, 20000 + i + 1],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // token_singles
  {
    console.log("token_singles");

    const toInsert: any[] = [];
    for (let i = 1; i <= 10000; i++) {
      toInsert.push({
        query: `INSERT INTO "token_singles"("contract", "token_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        values: [
          contracts[getRandomInt(0, contracts.length - 1)],
          getRandomInt(1, 50000),
        ],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // token_ranges
  {
    console.log("token_ranges");

    const toInsert: any[] = [];
    for (let i = 0; i < contracts.length; i++) {
      toInsert.push({
        query: `INSERT INTO "token_ranges"("view_id", "contract", "token_id_range") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        values: [100 + i + 1, contracts[i], `[1, 100]`],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // token_lists
  {
    console.log("token_lists");

    const toInsert: any[] = [];
    for (let i = 1; i <= 100; i++) {
      toInsert.push({
        query: `INSERT INTO "token_lists"("id", "view_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        values: [`${i}`, i],
      });
    }
    await db.none(pgp.helpers.concat(toInsert));
  }

  // token_lists_tokens
  {
    console.log("token_lists_tokens");

    const toInsert: any[] = [];
    for (let i = 1; i <= 100; i++) {
      const results = await db.manyOrNone(
        `SELECT "ta"."contract", "ta"."token_id" FROM "views_attributes" "va" JOIN "tokens_attributes" "ta" ON "va"."attribute_id" = "ta"."attribute_id" WHERE "va"."view_id" = $1`,
        [`${i}`]
      );
      for (const { contract, token_id } of results) {
        toInsert.push({
          query: `INSERT INTO "token_lists_tokens"("contract", "token_id", "token_list_id") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          values: [contract, token_id, `${i}`],
        });
      }
    }
    await db.none(pgp.helpers.concat(toInsert));
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
