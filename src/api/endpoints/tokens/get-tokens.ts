import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { marketFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-tokens";

export const getTokensOptions: RouteOptions = {
  description: "Get tokens",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      onSale: Joi.boolean(),
      sortBy: Joi.string().default("tokenId"),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            kind: Joi.string(),
            image: Joi.string(),
            tokenId: Joi.string(),
            collection: Joi.object({
              id: Joi.string(),
              name: Joi.string(),
            }),
          }),
          market: marketFormat,
        })
      ),
    }).label("getTokensResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_tokens_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await queries.getTokens(query as queries.GetTokensFilter);

      return { tokens };
    } catch (error) {
      logger.error("get_tokens_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
