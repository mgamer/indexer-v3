import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "./jobs";

import { start } from "./api";
import { logger } from "./common/logger";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

start();
