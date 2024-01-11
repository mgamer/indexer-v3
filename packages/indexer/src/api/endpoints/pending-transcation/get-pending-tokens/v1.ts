/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as pendingTranscation from "@/utils/pending-transcation";

const version = "v1";

export const getPendingTokensV1Options: RouteOptions = {
  description: "Pending Tokens",
  notes: "Get pending sale tokens",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      tokenIds: Joi.array().items(Joi.string()),
    }).label(`getPendingTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-pending-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    try {
      const tokenIds = await pendingTranscation.getContractPendingTokens(query.contract);
      return { tokenIds };
    } catch (error) {
      logger.error(`get-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
