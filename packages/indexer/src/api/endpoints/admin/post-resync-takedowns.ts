/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { syncTakedowns } from "@/jobs/takedowns";

export const postResyncTakedownsOptions: RouteOptions = {
  description: "Resync takedown collections and tokens",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    try {
      syncTakedowns();
      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-resync-takedowns", `Handler failure: ${error}`);
      throw error;
    }
  },
};
