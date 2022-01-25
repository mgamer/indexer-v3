import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/collections/get-collection-top-buys";

export const getCollectionTopBuysOptions: RouteOptions = {
  description:
    "Get the top buys for a single collection (and optionally an attribute).",
  tags: ["api", "collections"],
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      attributes: Joi.object().unknown(),
    }),
  },
  response: {
    schema: Joi.object({
      topBuys: Joi.array().items(
        Joi.object({
          value: Joi.number().unsafe(),
          quantity: Joi.number(),
        })
      ),
    }).label("getCollectionTopBuysResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_collection_top_buys_handler",
        `Wrong response schema: ${error}`
      );

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const topBuys = await queries.getCollectionTopBuys({
        ...params,
        ...query,
      } as queries.GetCollectionTopBuysFilter);

      return { topBuys };
    } catch (error) {
      logger.error(
        "get_collection_top_buys_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
