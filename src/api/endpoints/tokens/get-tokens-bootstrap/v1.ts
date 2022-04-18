/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v1";

export const getTokensBootstrapV1Options: RouteOptions = {
  description: "Get the current best price of every on sale token in a collection",
  notes:
    "This API will return the best price of every token in a collection that is currently on sale",
  tags: ["api", "2. Aggregator"],
  plugins: {
    "hapi-swagger": {
      order: 2,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      limit: Joi.number().integer().min(1).max(5000).default(5000),
    })
      .or("collection", "contract")
      .oxor("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          tokenId: Joi.string().pattern(/^[0-9]+$/),
          orderId: Joi.string(),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          validUntil: Joi.number().unsafe(),
          price: Joi.number().unsafe(),
          source: Joi.string().allow(null, ""),
        })
      ),
    }).label(`getTokensBootstrap${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-bootstrap-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "os"."source_id" AS "floor_sell_source_id",
          coalesce(
            nullif(date_part('epoch', upper("os"."valid_between")), 'Infinity'),
            0
          ) AS "floor_sell_valid_until"
        FROM "tokens" "t"
        LEFT JOIN "orders" "os"
          ON "t"."floor_sell_id" = "os"."id"
      `;

      // Filters
      const conditions: string[] = [`"t"."floor_sell_value" IS NOT NULL`];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "t"."floor_sell_value"`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const sources = await Sources.getInstance();
      const result = await edb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => {
          const source = r.floor_sell_source_id
            ? sources.getByAddress(fromBuffer(r.floor_sell_source_id))
            : null;

          return {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            orderId: r.floor_sell_id,
            maker: fromBuffer(r.floor_sell_maker),
            price: formatEth(r.floor_sell_value),
            validUntil: Number(r.floor_sell_valid_until),
            source: source ? source.name : null,
          };
        })
      );

      return { tokens: result };
    } catch (error) {
      logger.error(`get-tokens-bootstrap-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
