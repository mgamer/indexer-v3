/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex, toBuffer } from "@/common/utils";
import { ApiKeyManager } from "@/models/api-keys";
import { idb } from "@/common/db";

const version = "v1";

export const postUpdateMetadataDisabledV1Options: RouteOptions = {
  description: "Disable or reenable token or collection metadata",
  notes:
    "This API can be used by allowed API keys to disable or reenable metadata for a token or collection.",
  tags: ["api", "Management"],
  validate: {
    params: Joi.object({
      type: Joi.string()
        .valid("token", "collection")
        .description("Disable or reenable metadata for a token or collection"),
    }),
    payload: Joi.object({
      id: Joi.string()
        .when(Joi.ref("$params.type"), {
          is: "token",
          then: Joi.string().pattern(regex.token),
          otherwise: Joi.string().pattern(regex.collectionId),
        })
        .description(
          "Disable metadata for the given token or collection id. Example token id: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`. Example collection id: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      key: Joi.string().uuid().description("API key").required(),
      disable: Joi.boolean()
        .description("Whether to disable or reenable the metadata. Defaults to true (disable)")
        .default(true),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postUpdateMetadataDisabled${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-update-metadata-disabled-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    const params = request.params as any;

    try {
      const apiKey = await ApiKeyManager.getApiKey(payload.key);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.update_metadata_disabled) {
        throw Boom.unauthorized("Not allowed");
      }

      if (params.type === "token") {
        await idb.oneOrNone(
          `
            UPDATE "tokens"
            SET "metadata_disabled" = $/disable/
            WHERE "contract" = $/contract/
            AND "token_id" = $/token_id/
          `,
          {
            contract: toBuffer(payload.id.split(":")[0]),
            token_id: payload.id.split(":")[1],
            disable: Number(payload.disable),
          }
        );
      } else if (params.type === "collection") {
        await idb.oneOrNone(
          `
            UPDATE "collections"
            SET "metadata_disabled" = $/disable/
            WHERE "id" = $/id/
          `,
          {
            id: payload.id,
            disable: Number(payload.disable),
          }
        );
      }

      logger.info(
        `post-update-metadata-disabled-${version}-handler`,
        JSON.stringify({
          message: "Update metadata disabled status request accepted",
          id: payload.id,
          type: params.type,
          disable: payload.disable,
          apiKey: apiKey.key,
        })
      );

      return { message: "Update metadata disabled status request accepted" };
    } catch (error) {
      logger.warn(`post-update-metadata-disabled-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
