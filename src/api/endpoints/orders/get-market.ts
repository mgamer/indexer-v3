import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-market";

export const getMarketOptions: RouteOptions = {
  description:
    "Get aggregate liquidity information for a collection, attribute or token. Useful for building a market depth chart.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
    })
      .or("contract", "collection")
      .oxor("contract", "collection")
      .with("contract", "tokenId")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      market: Joi.object({
        buys: Joi.array().items(
          Joi.object({
            value: Joi.number().unsafe(),
            quantity: Joi.number(),
          })
        ),
        sells: Joi.array().items(
          Joi.object({
            value: Joi.number().unsafe(),
            quantity: Joi.number(),
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

      return { market };
    } catch (error) {
      logger.error("get_market_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
