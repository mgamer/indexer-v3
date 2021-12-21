import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens";
 
const getTokensResponse = Joi.object({
  tokens: Joi.array().items(
    Joi.object({
      token: Joi.object({
        contract: Joi.string(),
        kind: Joi.string(),
        image: Joi.string(),
        collection: Joi.object({
          id: Joi.string(),
          name: Joi.string()
        })
      }),
      market: Joi.object({
        floorSell: Joi.object({
          hash: Joi.string().allow(null),
          value: Joi.string().allow(null),
          maker: Joi.string().allow(null),
          validFrom: Joi.number().allow(null)
        }),
        topBuy: Joi.object({
          hash: Joi.string().allow(null),
          value: Joi.string().allow(null),
          maker: Joi.string().allow(null),
          validFrom: Joi.number().allow(null)
        })
      })
    })
  ),
}).label("getTokensResponse");

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
  // TODO: resolve response type error 500
  response: {
    schema: getTokensResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_tokens_handler",
        `Wrong response schema: ${error}`
      );
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

const getUserTokensResponse = Joi.object({
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
      ownership: Joi.object({
        tokenCount: Joi.number(),
        onSaleCount: Joi.number(),
        floorSellValue: Joi.string(),
        topBuyValue: Joi.string(),
        totalBuyValue: Joi.string(),
        lastAcquiredAt: Joi.number(),
    })
    })
  ),
}).label("getUserTokensResponse");


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
    schema: getUserTokensResponse,
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
