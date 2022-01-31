import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const pgp = PgPromise();
export const db = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  connectionTimeoutMillis: 10 * 1000,
  query_timeout: 60 * 1000,
  statement_timeout: 60 * 1000,
});
