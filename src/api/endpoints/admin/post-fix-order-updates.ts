import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";

export const postFixOrderUpdatesOptions: RouteOptions = {
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
      id: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      data: Joi.any(),
    })
      .or("id", "maker")
      .oxor("id", "maker")
      .with("data", "maker"),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const id = payload.id;
      const maker = payload.maker;
      const data = payload.data;

      if (id) {
        await orderUpdatesById.addToQueue([
          { context: `admin-check-id-${id}`, id },
        ]);
      } else if (maker && data) {
        await orderUpdatesByMaker.addToQueue([
          {
            context: `admin-check-maker-${maker}`,
            maker,
            timestamp: Math.floor(Date.now() / 1000),
            data,
          },
        ]);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(
        "post-fix-order-updates-handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
