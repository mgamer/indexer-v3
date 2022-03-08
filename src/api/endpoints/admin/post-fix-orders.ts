/* eslint-disable @typescript-eslint/no-explicit-any */

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
      id: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      kind: Joi.string().valid("balance"),
      side: Joi.string().valid("sell"),
    })
      .or("id", "maker", "kind")
      .with("kind", "side"),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const id = payload.id;
      const maker = payload.maker;
      const kind = payload.kind;
      const side = payload.side;

      if (id) {
        await orderFixes.addToQueue([{ by: "id", data: { id } }]);
      } else if (maker) {
        await orderFixes.addToQueue([{ by: "maker", data: { maker } }]);
      } else if (kind && side) {
        await orderFixes.addToQueue([
          {
            by: "all",
            data: { kind, side },
          },
        ]);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-orders-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
