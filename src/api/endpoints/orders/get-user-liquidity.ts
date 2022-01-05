import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-user-liquidity";

export const getUserLiquidityOptions: RouteOptions = {
  description: "Get aggrgate user liquidity, grouped by collection. Useful for showing a summary of liquidity being provided (orders made).",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      liquidity: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
            name: Joi.string(),
          }),
          buyCount: Joi.number().allow(null),
          topBuy: Joi.object({
            value: Joi.number().allow(null),
            validUntil: Joi.number().allow(null),
          }),
          sellCount: Joi.number().allow(null),
          floorSell: Joi.object({
            value: Joi.number().allow(null),
            validUntil: Joi.number().allow(null),
          }),
        })
      ),
    }).label("getUserLiquidityResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_user_liquidity_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const liquidity = await queries.getUserLiquidity({
        ...params,
        ...query,
      } as queries.GetUserLiquidityFilter);

      return { liquidity };
    } catch (error) {
      logger.error("get_user_liquidity_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
