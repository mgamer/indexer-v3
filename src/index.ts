import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";
import "@/pubsub/index";

import { start } from "@/api/index";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import { Sources } from "@/models/sources";

import { idb, pgp } from "./common/db";
import { keccak256 } from "@ethersproject/solidity";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (config.doBackgroundWork) {
    await Sources.syncSources();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  const results = await idb.manyOrNone(
    `
      SELECT domain FROM sources_v2 WHERE domain_hash IS NULL
    `
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];
  const columns = new pgp.helpers.ColumnSet(["domain", "domain_hash"], {
    table: "sources_v2",
  });

  for (const { domain } of results) {
    const domainHash = keccak256(["string"], [domain]).slice(0, 10);
    values.push({ domain, domain_hash: domainHash });
  }

  await idb.none(
    `
      UPDATE sources_v2 SET
        domain_hash = x.domain_hash::TEXT
      FROM (
        VALUES ${pgp.helpers.values(values, columns)}
      ) AS x(domain, domain_hash)
      WHERE sources_v2.domain = x.domain::TEXT
    `
  );
};

setup().then(() => start());
