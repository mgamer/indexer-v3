import Hapi from "@hapi/hapi";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";
import HapiSwagger from "hapi-swagger";
import qs from "qs";

import { setupRoutes } from "@/api/routes";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const start = async function (): Promise<void> {
  const server = Hapi.server({
    port: config.port,
    query: {
      parser: (query) => qs.parse(query),
    },
    router: {
      stripTrailingSlash: true,
    },
    routes: {
      cors: {
        origin: ["*"],
      },
      // Expose any validation errors
      // https://github.com/hapijs/hapi/issues/3706
      validate: {
        failAction: (_request, _h, error) => {
          // Remove any irrelevant information from the response
          delete (error as any).output.payload.validation;
          throw error;
        },
      },
    },
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
  logger.info("process", `Started on port ${config.port}`);
};
