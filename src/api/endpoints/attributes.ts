import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/attributes";

const getAttributesAggResponse = Joi.object({
  attributesAgg: Joi.array().items(
    Joi.object({
      key: Joi.string(),
      values: Joi.array().items(
        Joi.object({
          value: Joi.string(),
          count: Joi.number()
        })
      ),
    })
  ),
}).label("getAttributesAggResponse");

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
  response: {
    schema: getAttributesAggResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_attributes_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
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

const getCollectionAttributesResponse = Joi.object({
  attributes: Joi.array().items(
    Joi.object({
      key: Joi.string(),
      value: Joi.string(),
      set: Joi.object({
        token_count: Joi.string(),
        on_sale_count: Joi.string(),
        unique_owners_count: Joi.string(),
        sample_images: Joi.array().items(
          Joi.string()
        ),
        market: Joi.object({
          floorSell: Joi.object({
            hash: Joi.string().allow(null),
            value: Joi.string().allow(null),
            maker: Joi.string().allow(null),
            validFrom: Joi.number().allow(null)
          }),
          topBuy: Joi.object({
            hash: Joi.string().allow(null),
            value: Joi.string().allow(null),
            maker: Joi.string().allow(null),
            validFrom: Joi.number().allow(null)
          })
        })
      })
    })
  ),
}).label("getCollectionAttributesResponse");

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
  response: {
    schema: getCollectionAttributesResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_collection_attributes_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
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
