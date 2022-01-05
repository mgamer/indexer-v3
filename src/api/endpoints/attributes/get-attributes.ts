import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/attributes/get-attributes";

export const getAttributesOptions: RouteOptions = {
  description: "Get ALL attributes in a collection, and their counts. Useful for displaying filtering options.",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string(),
          values: Joi.array().items(
            Joi.object({
              value: Joi.string(),
              count: Joi.number(),
            })
          ),
        })
      ),
    }).label("getAttributesResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_attributes_handler", `Wrong response schema: ${error}`);
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
        keyValueCount[key][value] += count;
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

      return { attributes: attributesAgg };
    } catch (error) {
      logger.error("get_attributes_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
