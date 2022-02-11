import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";

const version = "v1";

export const getCollectionsV1Options: RouteOptions = {
  description:
    "Get a list of collections. Useful for getting all collections in a marketplace.",
  tags: ["api", "collections"],
  validate: {
    query: Joi.object({
      community: Joi.string().lowercase(),
      name: Joi.string().lowercase(),
      sortBy: Joi.string().valid("id", "floorCap").default("id"),
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
          tokenSetId: Joi.string().allow(null),
          royalties: Joi.object({
            recipient: Joi.string().allow(null),
            bps: Joi.number(),
          }),
          floorSellValue: Joi.number().unsafe().allow(null),
          topBuyValue: Joi.number().unsafe().allow(null),
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
            COUNT("t"."token_id") as "token_count"
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
        case "floorCap": {
          baseQuery += ` ORDER BY COUNT("t"."token_id") * MIN("t"."floor_sell_value") ${
            query.sortDirection || "DESC"
          }`;
          break;
        }

        case "id":
        default: {
          baseQuery += ` ORDER BY "c"."id" ${query.sortDirection || "ASC"}`;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          id: r.id,
          name: r.name,
          metadata: r.metadata,
          tokenSetId: r.token_set_id,
          royalties: r.royalties ? r.royalties[0] : null,
          floorSellValue: r.floor_sell_value
            ? formatEth(r.floor_sell_value)
            : null,
          topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
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
