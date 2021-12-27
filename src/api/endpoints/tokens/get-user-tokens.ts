import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { ownershipFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-user-tokens";

export const getUserTokensOptions: RouteOptions = {
  description: "Get user tokens",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string().lowercase(),
      hasOffer: Joi.boolean(),
      sortBy: Joi.string()
        .valid("acquiredAt", "topBuyListingTime")
        .default("acquiredAt"),
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
            tokenId: Joi.string(),
            image: Joi.string(),
            collection: Joi.object({
              id: Joi.string(),
              name: Joi.string(),
            }),
          }),
          ownership: ownershipFormat,
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
