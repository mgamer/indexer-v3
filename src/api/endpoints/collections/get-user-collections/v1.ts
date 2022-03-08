/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, toBuffer } from "@/common/utils";

const version = "v1";

export const getUserCollectionsV1Options: RouteOptions = {
  description: "User collections",
  notes:
    "Get aggregate stats for a user, grouped by collection. Useful for showing total portfolio information.",
  tags: ["api", "users"],
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string().lowercase(),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
            name: Joi.string().allow(null, ""),
            metadata: Joi.any().allow(null),
            floorAskPrice: Joi.number().unsafe().allow(null),
            topBidValue: Joi.number().unsafe().allow(null),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            liquidCount: Joi.string(),
          }),
        })
      ),
    }).label(`getUserCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-user-collections-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "c"."id",
          SUM("nb"."amount") AS "token_count",
          COUNT(*) FILTER (WHERE "t"."floor_sell_value" IS NOT NULL) AS "on_sale_count",
          COUNT(*) FILTER (WHERE "t"."top_buy_value" IS NOT NULL) AS "liquid_count",
          (
            SELECT MIN("t"."floor_sell_value") FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
          ) AS "floor_sell_value",
          (
            SELECT MAX("ts"."top_buy_value") FROM "token_sets" "ts"
            WHERE "ts"."id" = "c"."token_set_id"
          ) AS "top_buy_value"
        FROM "tokens" "t"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
        JOIN "nft_balances" "nb"
          ON "t"."contract" = "nb"."contract"
          AND "t"."token_id" = "nb"."token_id"
          AND "nb"."owner" = $/user/
          AND "nb"."amount" > 0
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [];
      if (query.community) {
        conditions.push(`"c"."community" = $/community/`);
      }
      if (query.collection) {
        conditions.push(`"c"."id" = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "c"."id", "nb"."owner"`;

      // Sorting
      baseQuery += ` ORDER BY SUM("nb"."amount") DESC, "nb"."owner"`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await edb
        .manyOrNone(baseQuery, { ...params, ...query })
        .then((result) =>
          result.map((r) => ({
            collection: {
              id: r.id,
              name: r.name,
              metadata: r.metadata,
              floorAskPrice: r.floor_sell_value
                ? formatEth(r.floor_sell_value)
                : null,
              topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            },
            ownership: {
              tokenCount: String(r.token_count),
              onSaleCount: String(r.on_sale_count),
              liquidCount: String(r.liquid_count),
            },
          }))
        );

      return { collections: result };
    } catch (error) {
      logger.error(
        `get-user-collections-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
