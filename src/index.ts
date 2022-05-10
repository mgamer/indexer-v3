import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { pgp } from "@/common/db";

import "@/common/tracer";
import "@/jobs/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);
  pgp.end();
  process.exit(1);
});

process.on("exit", () => {
  pgp.end();
});

start();
