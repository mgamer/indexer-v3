import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/collections";

const getCollectionsResponse = Joi.object({
  collections: Joi.array().items(
    Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        name: Joi.string(),
        description: Joi.string(),
        image: Joi.string(),
      }),
      royalties: Joi.object({
        recipient: Joi.string().allow(null),
        bps: Joi.number(),
      }),
      set: Joi.object({
        tokenCount: Joi.string(),
        onSaleCount: Joi.string(),
        uniqueOwnersCount: Joi.string(),
        sampleImages: Joi.array().items(Joi.string()),
        market: Joi.object({
          floorSell: {
            hash: Joi.string().allow(null),
            value: Joi.string().allow(null),
            maker: Joi.string().allow(null),
            validFrom: Joi.number().allow(null),
          },
          topBuy: Joi.object({
            hash: Joi.string().allow(null),
            value: Joi.string().allow(null),
            maker: Joi.string().allow(null),
            validFrom: Joi.number().allow(null),
          }),
        }),
      }),
    })
  ),
}).label("getCollectionsResponse");

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
  response: {
    schema: getCollectionsResponse,
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

const getUserCollectionsResponse = Joi.object({
  collections: Joi.array().items(
    Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        name: Joi.string()
      }),
      ownership: Joi.object({
        tokenCount: Joi.string(),
        onSaleCount: Joi.string(),
        floorSellValue: Joi.string().allow(null),
        topBuyValue: Joi.string(),
        totalBuyValue: Joi.string(),
        lastAcquiredAt: Joi.number()
      })
    })
  ),
}).label("getUserCollectionsResponse");

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
  response: {
    schema: getUserCollectionsResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_user_collections_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
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
