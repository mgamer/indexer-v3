/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as externalCosign from "@/utils/offchain-cancel/external-cosign";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";

const version = "v1";

export const postCosignKeyV1Options: RouteOptions = {
  description: "Create/Update an External Cosign Key",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      signer: Joi.string().lowercase().required(),
      endpoint: Joi.string().required(),
      apiKey: Joi.string().required(),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postCosignKey${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-cosign-key-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;
    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);
    if (_.isNull(apiKey)) {
      // throw Boom.unauthorized("Invalid API key");
    }

    try {
      await externalCosign.upsertExternalCosignKey(payload, request.headers["x-api-key"]);
      return { message: `Success` };
    } catch (error) {
      logger.error(`post-cosign-key-${version}-handler`, `Handler failure: ${error}`);
      return { message: (error as any).toString() };
    }
  },
};
