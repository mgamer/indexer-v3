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
import { redb } from "./common/db";
import { refreshRegistryRoyalties } from "./utils/royalties/registry";

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

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.master) {
    const result = await redb.manyOrNone(
      `
      SELECT id FROM collections
      ORDER BY all_time_volume DESC
      LIMIT 1000
    `
    );
    let i = 0;
    for (const { id } of result) {
      await refreshRegistryRoyalties(id);
      // eslint-disable-next-line no-console
      console.log(i++);
    }
  }
};

setup().then(() => start());
