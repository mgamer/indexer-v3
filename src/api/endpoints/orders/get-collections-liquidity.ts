import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-collections-liquidity";

export const getCollectionsLiquidityOptions: RouteOptions = {
  description: "Get aggregate collection liquidity.",
  tags: ["api", "orders"],
  validate: {
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
            image: Joi.string().allow(null, ""),
          }).required(),
          tokenCount: Joi.number(),
          liquidity: Joi.number().unsafe(),
          uniqueTopBuyers: Joi.number(),
          topLiquidityProvider: Joi.string().allow(null),
        })
      ),
    }).label("getCollectionsLiquidityResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_collections_liquidity_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const liquidity = await queries.getCollectionsLiquidity(
        query as queries.GetCollectionsLiquidityFilter
      );

      return { liquidity };
    } catch (error) {
      logger.error(
        "get_collections_liquidity_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
