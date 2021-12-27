import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { formatEth } from "@/common/bignumber";
import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get_market";

export const getMarketOptions: RouteOptions = {
  description: "Get market depth information",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
    })
      // TODO: Only the following combinations should be allowed:
      // - contract + tokenId
      // - collection
      // - collection + attributes
      .or("contract", "collection")
      .oxor("contract", "collection"),
  },
  response: {
    schema: Joi.object({
      market: Joi.object({
        buys: Joi.array().items(
          Joi.object({
            value: Joi.number().required(),
            quantity: Joi.number().required(),
          })
        ),
        sells: Joi.array().items(
          Joi.object({
            value: Joi.number().required(),
            quantity: Joi.number().required(),
          })
        ),
      }),
    }),
    failAction: (_request, _h, error) => {
      logger.error("get_market_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const market = await queries.getMarket(query as queries.GetMarketFilter);

      return {
        market: {
          buys: market.buys.map(({ value, quantity }) => ({
            value: formatEth(value),
            quantity: Number(quantity),
          })),
          sells: market.sells.map(({ value, quantity }) => ({
            value: formatEth(value),
            quantity: Number(quantity),
          })),
        },
      };
    } catch (error) {
      logger.error("get_market_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
