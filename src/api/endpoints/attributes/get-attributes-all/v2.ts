/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";

const version = "v2";

export const getAttributesAllV2Options: RouteOptions = {
  description: "Get all attributes in a collection",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          kind: Joi.string().valid("string", "number", "date", "range").required(),
          values: Joi.alternatives(
            Joi.array().items(
              Joi.object({
                value: Joi.string().required(),
                count: Joi.number(),
              })
            ),
            Joi.object({
              minRange: Joi.number(),
              maxRange: Joi.number(),
            })
          ),
        })
      ),
    }).label(`getAttributesAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-all-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const baseQuery = `
        SELECT attribute_keys.key, attribute_keys.kind,
               CASE WHEN attribute_keys.kind = 'range' THEN
                  MIN(attributes.value)
               END AS "min_range",
               CASE WHEN attribute_keys.kind = 'range' THEN
                  MAX(attributes.value)
               END AS "max_range",
               CASE WHEN attribute_keys.kind != 'range' THEN
                  array_agg(json_build_object('value', attributes.value, 'count', attributes.token_count))
               END AS "values"
        FROM attribute_keys
        JOIN attributes ON attribute_keys.id = attributes.attribute_key_id
        WHERE attribute_keys.collection_id = $/collection/
        AND attribute_keys.rank IS NOT NULL
        GROUP BY attribute_keys.id
        ORDER BY attribute_keys.rank DESC
      `;

      const result = await edb.manyOrNone(baseQuery, params).then((result) => {
        return result.map((r) => {
          return {
            key: r.key,
            kind: r.kind,
            values:
              r.kind == "range"
                ? {
                    minRange: r.min_range,
                    maxRange: r.max_range,
                  }
                : r.values,
          };
        });
      });

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
