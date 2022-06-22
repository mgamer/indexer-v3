import { RouteOptions } from "@hapi/hapi";
import { logger } from "@/common/logger";
import { inject } from "@/api/index";

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

      return JSON.parse(response.payload);
    } catch (error) {
      logger.error("get-open-api-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
