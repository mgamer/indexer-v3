/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

export const postSetCollectionCommunity: RouteOptions = {
  description: "Set a community for a specific collection",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Update community for a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      community: Joi.string().required().allow(""),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = payload.collection;
      const community = payload.community;

      await Collections.update(collection, { community });

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-set-community-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
