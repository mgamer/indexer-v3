/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { idb } from "@/common/db";

export const postIncrementCollectionMetadataVersionOptions: RouteOptions = {
  description: "Increment the metadata version for a collection to bust the cache",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "The collection for which to increment the metadata version, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collectionId = payload.collection;

      // if metadata version is null, set it to 1, otherwise increment it
      await idb.oneOrNone(
        `
          UPDATE collections
          SET metadata_refresh_version = COALESCE(metadata_refresh_version, 0) + 1
          WHERE id = $1
        `,
        [collectionId]
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-increment-metadata-version-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
