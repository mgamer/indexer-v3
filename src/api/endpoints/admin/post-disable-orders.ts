import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const postDisableOrdersOptions: RouteOptions = {
  description: "Disable orders",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      hashes: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-f0-9]{64}$/)
          .required()
      ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const hashes = payload.hashes;

      await db.none(
        `
          update "orders" "o" set
            "status" = 'disabled'
          where "o"."hash" in ($1:csv)
            and "o"."status" = 'valid'
        `,
        [hashes]
      );

      return { message: "Success" };
    } catch (error) {
      logger.error("post_disable_orders_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
