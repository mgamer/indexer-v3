import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const run = async () => {
  try {
    // Before starting, ensure the current network is supported
    getNetworkSettings();
  } catch (error) {
    logger.error("process", `Unrecoverable error: ${error}`);
  }
  start();
};

run();
