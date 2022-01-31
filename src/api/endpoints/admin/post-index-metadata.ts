import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const postIndexMetadataOptions: RouteOptions = {
  description: "Trigger (re)indexing of metadata.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const collection = payload.collection;

      await db.none(
        `
          update "tokens" set "metadata_indexed" = false
          where "collection_id" = $/collection/
        `,
        { collection }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error("post_index_metadata_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
