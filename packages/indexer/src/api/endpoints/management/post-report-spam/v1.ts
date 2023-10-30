/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import { regex, toBuffer } from "@/common/utils";
import Joi from "joi";
import * as Boom from "@hapi/boom";
import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";
import { idb } from "@/common/db";
import {
  ActionsContext,
  ActionsOrigin,
  actionsTrackingJob,
} from "@/jobs/actions-tracking/actions-tracking-job";

const version = "v1";

export const postReportSpamV1Options: RouteOptions = {
  description: "Report if a collection or specific token is spam",
  notes: "This API can be used by allowed API keys to report spam on a token or collection.",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    payload: Joi.object({
      key: Joi.string().uuid().description("API key").required(),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Report the given token as spam. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string().description(
        "Report the given collection as spam. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      active: Joi.boolean()
        .description("Whether to report or un-report the token/collection")
        .default(true),
    }).or("token", "collection"),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postReportSpam${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-report-spam-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    let updateResult;

    try {
      const id = payload.token ? payload.token : payload.collection;
      const type = payload.token ? "token" : "collection";
      const apiKey = await ApiKeyManager.getApiKey(payload.key);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.report_spam) {
        throw Boom.unauthorized("Not allowed");
      }

      if (type === "token") {
        updateResult = await idb.result(
          `
            UPDATE tokens
            SET is_spam = $/active/
            WHERE contract = $/contract/
            AND token_id = $/token_id/
            AND is_spam IS DISTINCT FROM $/active/
          `,
          {
            contract: toBuffer(id.split(":")[0]),
            token_id: id.split(":")[1],
            active: Number(payload.active) ? 100 : -100,
          }
        );
      } else if (type === "collection") {
        updateResult = await idb.result(
          `
            UPDATE collections
            SET is_spam = $/active/
            WHERE id = $/id/
            AND is_spam IS DISTINCT FROM $/active/
          `,
          {
            id,
            active: Number(payload.active) ? 100 : -100,
          }
        );
      }

      if (updateResult && updateResult.rowCount) {
        // Track the change
        if (type === "token") {
          await actionsTrackingJob.addToQueue([
            {
              context: ActionsContext.SpamTokenUpdate,
              origin: ActionsOrigin.API,
              actionTakerIdentifier: apiKey.key,
              data: {
                contract: id.split(":")[0],
                tokenId: id.split(":")[1],
                newSpamState: Number(payload.active),
              },
            },
          ]);
        } else if (type === "collection") {
          await actionsTrackingJob.addToQueue([
            {
              context: ActionsContext.SpamCollectionUpdate,
              origin: ActionsOrigin.API,
              actionTakerIdentifier: apiKey.key,
              data: {
                collection: id,
                newSpamState: Number(payload.active),
              },
            },
          ]);
        }

        logger.info(
          `post-report-spam-${version}-handler`,
          JSON.stringify({
            message: "Report spam request accepted",
            id,
            type,
            active: payload.active,
            apiKey: apiKey.key,
          })
        );
      }

      return {
        message: `Report spam for ${
          type === "token" ? `token ${payload.token}` : `collection ${payload.collection}`
        } request accepted`,
      };
    } catch (error) {
      logger.error(`post-report-spam-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
