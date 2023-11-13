/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export const postUpdateImageVersionOptions: RouteOptions = {
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
        .description(
          "The collection for which to increment the metadata version, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Refresh the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      // if token is provided, refresh the token
      if (payload.token) {
        const [contract, tokenId] = payload.token.split(":");
        await idb.oneOrNone(
          `
          UPDATE tokens
            SET image_version_updated_at = NOW()
          WHERE contract = $1 AND token_id = $2
        `,
          [toBuffer(contract), tokenId]
        );
        return { message: "Request accepted" };
      }

      const collectionId = payload.collection;

      // update all tokens in the collection
      await idb.oneOrNone(
        `
        UPDATE tokens
          SET image_version_updated_at = NOW()
        WHERE collection_id = $1
      `,
        [toBuffer(collectionId)]
      );
      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-increment-metadata-version-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
