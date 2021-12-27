import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const pgp = PgPromise();
export const db = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
});
