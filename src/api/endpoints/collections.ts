import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/collections";

const getCollectionsResponse = Joi.object({
  collections: Joi.array().items(Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        name: Joi.string(),
        description: Joi.string(),
        image: Joi.string(),
      }),
      royalties: Joi.object({
        recipient: Joi.string().optional(),
        bps: Joi.number(),
      }),
      set: Joi.object({
        compositionId: Joi.string().optional(),
        tokenCount: Joi.string(),
        onSaleCount: Joi.string(),
        uniqueOwnersCount: Joi.string(),
        sampleImages: Joi.array().items(Joi.string()),
        market: Joi.object({
          floorSell: {
            hash: Joi.string(),
            value: Joi.string(),
            maker: Joi.string(),
            validFrom: Joi.number(),
          },
          topBuy: Joi.object({
            hash: Joi.string(),
            value: Joi.string(),
            maker: Joi.string(),
            validFrom: Joi.number(),
          }),
        }),
      })
  }))
}).label('getCollectionsResponse');

export const getCollectionsOptions: RouteOptions = {
  description: "Get collections",
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
  //response: {schema: getCollectionsResponse}, // this format validates, and gives 500 error with no explanation
  plugins: {
    'hapi-swagger': {
        produces: ['application/json'],
        responses: {
            200: {
                description: 'Successful',
                schema: getCollectionsResponse
            }
        }
    }
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

export const getUserCollectionsOptions: RouteOptions = {
  description: "Get user collections",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string().lowercase(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const collections = await queries.getUserCollections({
        ...params,
        ...query,
      } as queries.GetUserCollectionsFilter);
      return { collections };
    } catch (error) {
      logger.error("get_user_collections_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
