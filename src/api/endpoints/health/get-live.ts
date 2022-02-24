import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";

export const getLiveOptions: RouteOptions = {
  description:
    "The live health check, checks if all necessary services are reachable.",
  handler: async (_request: Request) => {
    if (await HealthCheck.check()) {
      return true;
    } else {
      throw Boom.internal("Service not healthy");
    }
  },
};
