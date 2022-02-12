import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";

const version = "v1";

export const getCollectionsV1Options: RouteOptions = {
  description:
    "Get a list of collections. Useful for getting all collections in a marketplace.",
  tags: ["api", "collections"],
  validate: {
    query: Joi.object({
      community: Joi.string().lowercase(),
      name: Joi.string().lowercase(),
      sortBy: Joi.string().valid("id").default("id"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          name: Joi.string().allow(null, ""),
          metadata: Joi.any().allow(null),
          tokenCount: Joi.number(),
          tokenSetId: Joi.string().allow(null),
          royalties: Joi.object({
            recipient: Joi.string().allow(null),
            bps: Joi.number(),
          }),
          floorSellValue: Joi.number().unsafe().allow(null),
          topBuyValue: Joi.number().unsafe().allow(null),
          topBuyMaker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .allow(null),
        })
      ),
    }).label(`getCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collections-${version}-handler`,
        `Wrong response schema: ${error}`
      );

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "c"."id",
          "c"."name",
          "c"."metadata",
          "c"."royalties",
          "c"."token_set_id",
          "c"."token_count",
          (
            SELECT MIN("t"."floor_sell_value") FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
          ) AS "floor_sell_value"
        FROM "collections" "c"
        JOIN "tokens" "t"
          ON "c"."id" = "t"."collection_id"
      `;

      // Filters
      const conditions: string[] = [];
      if (query.community) {
        conditions.push(`"c"."community" = $/community/`);
      }
      if (query.name) {
        query.name = `%${query.name}%`;
        conditions.push(`"c"."name" ilike $/name/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "c"."id"`;

      // Sorting
      switch (query.sortBy) {
        case "id":
        default: {
          baseQuery += ` ORDER BY "c"."id" ${query.sortDirection || "ASC"}`;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          "y".*
        FROM "x"
        LEFT JOIN LATERAL (
          SELECT
            "ts"."top_buy_value",
            "ts"."top_buy_maker"
          FROM "token_sets" "ts"
          WHERE "ts"."id" = "x"."token_set_id"
          ORDER BY "ts"."top_buy_value" DESC
          LIMIT 1
        ) "y" ON TRUE
      `;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          id: r.id,
          name: r.name,
          metadata: r.metadata,
          tokenCount: Number(r.token_count),
          tokenSetId: r.token_set_id,
          royalties: r.royalties ? r.royalties[0] : null,
          floorSellValue: r.floor_sell_value
            ? formatEth(r.floor_sell_value)
            : null,
          topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          topBuyMaker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
        }))
      );

      return { collections: result };
    } catch (error) {
      logger.error(
        `get-collections-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
