import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";

// https://github.com/OptimalBits/bull/issues/503
process.setMaxListeners(0);

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

start();
