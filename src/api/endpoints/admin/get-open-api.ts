import { RouteOptions } from "@hapi/hapi";
import { logger } from "@/common/logger";
import { inject } from "@/api/index";
import swagger2openapi from "swagger2openapi";

export const getOpenApiOptions: RouteOptions = {
  description: "Get swagger json in OpenApi V3",
  tags: ["api", "x-admin"],
  timeout: {
    server: 10 * 1000,
  },
  handler: async () => {
    try {
      const response = await inject({
        method: "GET",
        url: "/swagger.json",
      });

      const swagger = JSON.parse(response.payload);

      const data = await swagger2openapi.convertObj(swagger, {
        patch: true,
        warnOnly: true,
      });

      data.openapi["servers"] = [
        {
          url: "https://api.reservoir.tools",
        },
        {
          url: "http://api-rinkeby.reservoir.tools",
        },
      ];

      return data.openapi;
    } catch (error) {
      logger.error("get-open-api-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
