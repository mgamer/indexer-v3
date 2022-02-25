import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getUserTokensV1Options: RouteOptions = {
  description:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "tokens"],
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      community: Joi.string().lowercase(),
      collection: Joi.string(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      hasOffer: Joi.boolean(),
      sortBy: Joi.string().valid("acquiredAt", "topBuyValue"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              schema: Joi.any().allow(null),
            }),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string().allow(null, ""),
            onSaleCount: Joi.string().allow(null, ""),
            floorSellValue: Joi.number().unsafe().allow(null),
            acquiredAt: Joi.number().allow(null),
          }),
        })
      ),
    }).label(`getUserTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-user-tokens-${version}-handler`,
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
        SELECT DISTINCT ON ("t"."contract", "t"."token_id")
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "nb"."amount" as "token_count",
          (CASE WHEN "t"."floor_sell_value" IS NOT NULL
            THEN 1
            ELSE 0
          END) AS "on_sale_count",
          "t"."floor_sell_id",
          "t"."top_buy_id",
          "t"."top_buy_value",
          "ts"."schema" AS "top_buy_schema",
          "nb"."amount" * "t"."top_buy_value" AS "total_buy_value",
          "nte"."timestamp" AS "acquired_at"
        FROM "tokens" "t"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
        JOIN "nft_balances" "nb"
          ON "t"."contract" = "nb"."contract"
          AND "t"."token_id" = "nb"."token_id"
          AND "nb"."owner" = $/user/
          AND "nb"."amount" > 0
        JOIN "nft_transfer_events" "nte"
          ON "t"."contract" = "nte"."address"
          AND "t"."token_id" = "nte"."token_id"
          AND "nte"."to" = $/user/
        LEFT JOIN "orders" "o"
          ON "t"."top_buy_id" = "o"."id"
        LEFT JOIN "token_sets" "ts"
          ON "o"."token_set_id" = "ts"."id"
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [];
      if (query.community) {
        conditions.push(`"c"."community" = $/community/`);
      }
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.hasOffer) {
        conditions.push(`"t"."top_buy_value" IS NOT NULL`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += `
        ORDER BY
          "t"."contract",
          "t"."token_id",
          "nte"."block" DESC NULLS LAST
      `;

      // https://stackoverflow.com/a/18939498
      baseQuery = `SELECT "x".* FROM (${baseQuery}) "x"`;

      switch (query.sortBy) {
        case "acquiredAt": {
          baseQuery += `
            ORDER BY
              "x"."acquired_at" ${query.sortDirection || "DESC"},
              "x"."contract",
              "x"."token_id"
          `;
          break;
        }

        case "topBuyValue":
        default: {
          baseQuery += `
            ORDER BY
              "x"."top_buy_value" ${query.sortDirection || "DESC"} NULLS LAST,
              "x"."contract",
              "x"."token_id"
          `;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await db
        .manyOrNone(baseQuery, { ...query, ...params })
        .then((result) =>
          result.map((r) => ({
            token: {
              contract: fromBuffer(r.contract),
              tokenId: r.token_id,
              name: r.name,
              image: r.image,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
              },
              topBid: {
                id: r.top_buy_id,
                value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                schema: r.top_buy_schema,
              },
            },
            ownership: {
              tokenCount: r.token_count,
              onSaleCount: r.on_sale_count,
              floorSellValue: r.floor_sell_value
                ? formatEth(r.floor_sell_value)
                : null,
              acquiredAt: Number(r.acquired_at),
            },
          }))
        );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-user-tokens-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
