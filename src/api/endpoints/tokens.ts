import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens";

export const getTokensOptions: RouteOptions = {
  description: "Get tokens",
  tags: ["api"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase(),
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      owner: Joi.string().lowercase(),
      attributes: Joi.object().unknown().when("collection", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract", "owner"),
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

export const getTokenOwnersOptions: RouteOptions = {
  description: "Get token owners",
  tags: ["api"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase(),
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      owner: Joi.string().lowercase(),
      attributes: Joi.object().unknown().when("collection", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract", "owner"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const owners = await queries.getTokenOwners(
        query as queries.GetTokenOwnersFilter
      );
      return { owners };
    } catch (error) {
      logger.error("get_token_owners_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

export const getTokenStatsOptions: RouteOptions = {
  description: "Get token stats",
  tags: ["api"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase(),
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      onSale: Joi.boolean(),
      attributes: Joi.object().unknown().when("collection", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const stats = await queries.getTokenStats(
        query as queries.GetTokenStatsFilter
      );
      return { stats };
    } catch (error) {
      logger.error("get_token_stats_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
