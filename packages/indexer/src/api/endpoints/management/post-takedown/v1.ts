/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { ApiKeyManager } from "@/models/api-keys";
import { idb } from "@/common/db";

const version = "v1";

export const postTakedownV1Options: RouteOptions = {
  description: "Takedown token or collection",
  notes:
    "This API can be used by allowed API keys to take down a token or collection. This will remove the token or collection from the API and prevent it from being indexed again.",
  tags: ["api", "Management"],
  validate: {
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Takedown the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string().description(
        "Takedown the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      key: Joi.string().uuid().description("API key").required(),
      active: Joi.boolean()
        .description("Whether to activate or deactivate the token/collection")
        .default(true),
    }).or("token", "collection"),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postTakedown${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-takedown-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      let id;
      let type;
      const apiKey = await ApiKeyManager.getApiKey(payload.key);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.takedown) {
        throw Boom.unauthorized("Not allowed");
      }

      if (payload.token) {
        id = payload.token;
        type = "token";
      }

      if (payload.collection) {
        id = payload.collection;
        type = "collection";
      }

      await idb.oneOrNone(
        `
          INSERT INTO "takedowns" (
            "id",
            "type",
            "api_key",
            "active"
          ) VALUES (
            $/id/,
            $/type/,
            $/api_key/,
            $/active/
          )
          ON CONFLICT (id, type, api_key)
          DO UPDATE SET
            "active" = $/active/,
            "updated_at" = now()         
        `,
        {
          id,
          type,
          api_key: apiKey.key,
          active: payload.active,
        }
      );

      return { message: "Takedown request accepted" };
    } catch (error) {
      logger.warn(`post-takedown-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
