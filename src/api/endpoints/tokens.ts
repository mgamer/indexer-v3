import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens";

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

export const getTokensStatsOptions: RouteOptions = {
  description: "Get tokens stats",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      onSale: Joi.boolean(),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const stats = await queries.getTokensStats(
        query as queries.GetTokensStatsFilter
      );
      return { stats };
    } catch (error) {
      logger.error("get_tokens_stats_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

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
