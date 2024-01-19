import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import * as pendingTxs from "@/utils/pending-txs";

const version = "v1";

export const getRecentPendingTokensV1Options: RouteOptions = {
  description: "Recent Pending tokens",
  notes: "Get tokens which have a pending sale transaction",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {},
  response: {
    schema: Joi.array()
      .items(
        Joi.object({
          tokenId: Joi.string().pattern(regex.number),
          contract: Joi.string(),
          txHash: Joi.string(),
          seen: Joi.string().pattern(regex.number),
        })
      )
      .label(`getRecentPendingTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-recent-pending-tokens-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async () => {
    try {
      const result = await pendingTxs.getRecentPendingTokens();
      return result;
    } catch (error) {
      logger.error(`get-recent-pending-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
