import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { setFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/collections/get-collections";

export const getCollectionsOptions: RouteOptions = {
  description:
    "Get a list of collections. Useful for getting all collections in a marketplace. Returns minimal details and stats are refreshed every 5 mins.",
  tags: ["api"],
  validate: {
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string().lowercase(),
      name: Joi.string().lowercase(),
      sortBy: Joi.string().valid("id", "floorCap").default("id"),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
            name: Joi.string(),
            description: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
          }),
          royalties: Joi.object({
            recipient: Joi.string().allow(null),
            bps: Joi.number(),
          }),
          set: setFormat,
        })
      ),
    }).label("getCollectionsResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_collections_handler",
        `Wrong response schema: ${error}`
      );

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const collections = await queries.getCollections(
        query as queries.GetCollectionsFilter
      );
      return { collections };
    } catch (error) {
      logger.error("get_collections_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
