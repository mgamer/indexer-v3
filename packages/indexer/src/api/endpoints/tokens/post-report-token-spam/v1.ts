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

export const postReportTokenSpamV1Options: RouteOptions = {
  description: "Report if a token is spam",
  notes: "This API can be used by allowed API keys to report spam on a token.",
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
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    params: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .required()
        .description(
          "The token to report / un-report, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`. Requires an authorized api key to be passed."
        ),
    }),
    payload: Joi.object({
      active: Joi.boolean()
        .description("Whether to report or un-report the token as spam")
        .default(true),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postReportTokenSpam${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-report-token-spam-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const payload = request.payload as any;
    let updateResult;

    try {
      const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.report_spam) {
        throw Boom.unauthorized("Not allowed");
      }

      updateResult = await idb.result(
        `
            UPDATE tokens
            SET is_spam = $/active/
            WHERE contract = $/contract/
            AND token_id = $/token_id/
            AND is_spam IS DISTINCT FROM $/active/
          `,
        {
          contract: toBuffer(params.token.split(":")[0]),
          token_id: params.token.split(":")[1],
          active: Number(payload.active) ? 100 : -100,
        }
      );

      if (updateResult && updateResult.rowCount) {
        // Track the change
        await actionsTrackingJob.addToQueue([
          {
            context: ActionsContext.SpamTokenUpdate,
            origin: ActionsOrigin.API,
            actionTakerIdentifier: apiKey.key,
            data: {
              contract: params.token.split(":")[0],
              tokenId: params.token.split(":")[1],
              newSpamState: Number(payload.active),
            },
          },
        ]);
      }

      return {
        message: `Report spam for token ${params.token} request accepted`,
      };
    } catch (error) {
      logger.error(`post-report-token-spam-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
