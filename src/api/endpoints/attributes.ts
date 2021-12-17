import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/attributes";

export const getAttributesOptions: RouteOptions = {
  description: "Get attributes",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const attributes = await queries.getAttributes(
        query as queries.GetAttributesFilter
      );

      const keyValueCount: any = {};
      for (const { key, value, count } of attributes) {
        if (!keyValueCount[key]) {
          keyValueCount[key] = {};
        }
        if (!keyValueCount[key][value]) {
          keyValueCount[key][value] = 0;
        }
        keyValueCount[key][value] += Number(count);
      }

      const attributesAgg: any[] = [];
      for (const [key, values] of Object.entries(keyValueCount)) {
        attributesAgg.push({
          key,
          values: [],
        });
        for (const [value, count] of Object.entries(values as any)) {
          attributesAgg[attributesAgg.length - 1].values.push({
            value,
            count,
          });
        }
      }

      return { attributesAgg };
    } catch (error) {
      logger.error("get_attributes_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

export const getCollectionAttributesOptions: RouteOptions = {
  description: "Get collection attributes",
  tags: ["api"],
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      attribute: Joi.string(),
      onSaleCount: Joi.number(),
      sortBy: Joi.string()
        .valid("key", "floorSellValue", "floorCap")
        .default("key"),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const attributes = await queries.getCollectionAttributes({
        ...params,
        ...query,
      } as queries.GetCollectionAttributesFilter);
      return { attributes };
    } catch (error) {
      logger.error(
        "get_collection_attributes_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
