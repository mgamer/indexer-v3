import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const pgp = PgPromise();
export const db = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  max: 20,
  connectionTimeoutMillis: 60 * 1000,
  query_timeout: 5 * 60 * 1000,
  statement_timeout: 5 * 60 * 1000,
});
