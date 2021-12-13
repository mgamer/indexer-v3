import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  process.exit(1);
});

start();
