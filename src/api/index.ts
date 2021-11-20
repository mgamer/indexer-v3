import Hapi from "@hapi/hapi";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";
import HapiSwagger from "hapi-swagger";

import { logger } from "../common/logger";
import { config } from "../config";
import { setupRoutes } from "./routes";

export const start = async function (): Promise<void> {
  const server = Hapi.server({
    port: config.port,
  });

  await server.register([
    {
      plugin: Inert,
    },
    {
      plugin: Vision,
    },
    {
      plugin: HapiSwagger,
      options: <HapiSwagger.RegisterOptions>{
        info: {
          title: "Reservoir Protocol indexer",
          version: require("../../package.json").version,
        },
      },
    },
  ]);

  setupRoutes(server);

  await server.start();
  logger.info(`api`, `Started on port ${config.port}`);
};
