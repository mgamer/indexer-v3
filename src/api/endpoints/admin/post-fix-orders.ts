import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderFixes from "@/jobs/order-fixes/queue";

export const postFixOrdersOptions: RouteOptions = {
  description: "Trigger fixing any order inconsistencies.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      kind: Joi.string().valid("balance").required(),
      side: Joi.string().valid("sell").required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const kind = payload.kind;
      const side = payload.side;

      await orderFixes.addToQueue([{ kind, side }]);

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-orders-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
