import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-users-liquidity";

export const getUsersLiquidityOptions: RouteOptions = {
  description: "Get aggregate user liquidity.",
  tags: ["api"],
  validate: {
    query: Joi.object({
      collection: Joi.string(),
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      liquidity: Joi.array().items(
        Joi.object({
          user: Joi.string(),
          rank: Joi.number(),
          tokenCount: Joi.number(),
          liquidity: Joi.number().unsafe(),
          maxTopBuyValue: Joi.number().unsafe(),
          wethBalance: Joi.number().unsafe(),
        })
      ),
    }).label("getUsersLiquidityResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_users_liquidity_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const liquidity = await queries.getUsersLiquidity(
        query as queries.GetUsersLiquidityFilter
      );

      return { liquidity };
    } catch (error) {
      logger.error("get_users_liquidity_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
