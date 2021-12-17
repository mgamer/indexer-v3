import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/collections";

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
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const data = await queries.getCollections(
        query as queries.GetCollectionsFilter
      );
      return { data };
    } catch (error) {
      logger.error("get_collections_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

export const getCollectionOwnershipsOptions: RouteOptions = {
  description: "Get collection ownerships",
  tags: ["api"],
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      owner: Joi.string().lowercase(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const owners = await queries.getCollectionOwnerships({
        ...params,
        ...query,
      } as queries.GetCollectionOwnershipsFilter);
      return { owners };
    } catch (error) {
      logger.error(
        "get_collection_ownerships_handler",
        `Handler failure: ${error}`
      );
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
