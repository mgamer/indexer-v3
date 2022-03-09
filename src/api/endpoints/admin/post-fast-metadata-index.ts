/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as metadataIndexFast from "@/jobs/metadata-index/fast-queue";

export const postFastMetadataIndexOptions: RouteOptions = {
  description: "Trigger fast metadata indexing for collection.",
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
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = payload.collection;

      // Make sure the collection exists
      const result = await idb.oneOrNone(
        `
          SELECT "token_count" FROM "collections"
          WHERE "id" = $/collection/
        `,
        { collection }
      );
      if (!result?.token_count) {
        throw Boom.badData("Unknown collection");
      }

      // Fast indexing is only supported for relatively small collections
      if (Number(result?.token_count) > 20000) {
        throw Boom.badData("Collection too big");
      }

      await metadataIndexFast.addToQueue([{ collection }]);

      return { message: "Success" };
    } catch (error) {
      logger.error(
        "post-fast-metadata-index-handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
