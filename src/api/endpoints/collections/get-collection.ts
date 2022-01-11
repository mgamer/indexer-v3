import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { setFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/collections/get-collection";

export const getCollectionOptions: RouteOptions = {
  description:
    "Get a single collection. Returns more detailed information, and real-time stats.",
  tags: ["api"],
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
  },
  response: {
    schema: Joi.object({
      collection: Joi.object({
        collection: Joi.object({
          id: Joi.string(),
          name: Joi.string(),
          description: Joi.string(),
          image: Joi.string().allow(""),
          lastBuy: {
            value: Joi.number().unsafe().allow(null),
            timestamp: Joi.number().allow(null),
          },
          lastSell: {
            value: Joi.number().unsafe().allow(null),
            timestamp: Joi.number().allow(null),
          },
        }),
        royalties: Joi.object({
          recipient: Joi.string().allow(null),
          bps: Joi.number(),
        }),
        set: setFormat,
      }).allow(null),
    }).label("getCollectionResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_collection_handler", `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const collection = await queries.getCollection(
        params as queries.GetCollectionFilter
      );
      return { collection };
    } catch (error) {
      logger.error("get_collection_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
