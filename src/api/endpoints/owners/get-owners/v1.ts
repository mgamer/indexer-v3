import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getOwnersV1Options: RouteOptions = {
  description:
    "Get a list of owners and their ownership info. Useful for exploring top owners in a collection or attribute.",
  tags: ["api", "owners"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract")
      .with("tokenId", "contract"),
  },
  response: {
    schema: Joi.object({
      owners: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          ownership: Joi.object({
            tokenCount: Joi.number(),
            onSaleCount: Joi.number(),
            floorAskPrice: Joi.number().unsafe().allow(null),
            topBidValue: Joi.number().unsafe().allow(null),
            totalBidValue: Joi.number().unsafe().allow(null),
          }),
        })
      ),
    }).label(`getOwners${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-owners-${version}-handler`,
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
          "nb"."owner",
          SUM("nb"."amount") AS "token_count",
          COUNT(*) FILTER (WHERE "t"."floor_sell_value" IS NOT NULL) AS "on_sale_count",
          MIN("t"."floor_sell_value") AS "floor_sell_value",
          MAX("t"."top_buy_value") AS "top_buy_value",
          SUM("nb"."amount") * MAX("t"."top_buy_value") AS "total_buy_value"
        FROM "tokens" "t"
        JOIN "nft_balances" "nb"
          ON "t"."contract" = "nb"."contract"
          AND "t"."token_id" = "nb"."token_id"
          AND "nb"."amount" > 0
      `;

      // Filters
      const conditions: string[] = [];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }
      if (query.tokenId) {
        conditions.push(`"t"."token_id" = $/tokenId/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "nb"."owner"`;

      // Sorting
      baseQuery += ` ORDER BY "token_count" DESC, "nb"."owner"`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          address: fromBuffer(r.owner),
          ownership: {
            tokenCount: Number(r.token_count),
            onSaleCount: Number(r.on_sale_count),
            floorAskPrice: r.floor_sell_value
              ? formatEth(r.floor_sell_value)
              : null,
            topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            totalBidValue: r.total_buy_value
              ? formatEth(r.total_buy_value)
              : null,
          },
        }))
      );

      return { owners: result };
    } catch (error) {
      logger.error(
        `get-owners-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
