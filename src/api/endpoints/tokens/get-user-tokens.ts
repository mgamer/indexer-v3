import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-user-tokens";

export const getUserTokensOptions: RouteOptions = {
  description:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string().lowercase(),
      hasOffer: Joi.boolean(),
      sortBy: Joi.string().valid("acquiredAt", "topBuyValue"),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            name: Joi.string().allow("", null),
            image: Joi.string().allow(""),
            tokenId: Joi.string(),
            collection: Joi.object({
              id: Joi.string(),
              name: Joi.string(),
            }),
            floorSellValue: Joi.number().unsafe().allow(null),
            topBuy: Joi.object({
              hash: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              schema: Joi.any().allow(null),
            }),
          }),
          ownership: Joi.object({
            tokenCount: Joi.number(),
            onSaleCount: Joi.number(),
            lastAcquiredAt: Joi.number().allow(null),
          }),
        })
      ),
    }).label("getUserTokensResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_user_tokens_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const tokens = await queries.getUserTokens({
        ...params,
        ...query,
      } as queries.GetUserTokensFilter);

      return { tokens };
    } catch (error) {
      logger.error("get_user_tokens_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
