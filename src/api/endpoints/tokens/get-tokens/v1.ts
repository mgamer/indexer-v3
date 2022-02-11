import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensV1Options: RouteOptions = {
  description:
    "Get a list of tokens. Useful for showing the best priced tokens in a collection or attribute.",
  tags: ["api", "tokens"],
  validate: {
    query: Joi.object({
      collection: Joi.string(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      tokenSetId: Joi.string().lowercase(),
      onSale: Joi.boolean(),
      sortBy: Joi.string()
        .valid("tokenId", "floorSellValue", "topBuyValue")
        .default("floorSellValue"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("collection", "contract", "tokenSetId")
      .oxor("collection", "contract", "tokenSetId")
      .with("tokenId", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          tokenId: Joi.string()
            .pattern(/^[0-9]+$/)
            .required(),
          name: Joi.string().allow(null, ""),
          image: Joi.string().allow(null, ""),
          collection: Joi.object({
            id: Joi.string().allow(null),
            name: Joi.string().allow(null, ""),
          }),
          topBuyValue: Joi.number().unsafe().allow(null),
          floorSellValue: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-${version}-handler`,
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
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "t"."floor_sell_value",
          "t"."top_buy_value"
        FROM "tokens" "t"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
      `;

      if (query.tokenSetId) {
        baseQuery += `
          JOIN "token_sets_tokens" "tst"
            ON "t"."contract" = "tst"."contract"
            AND "t"."token_id" = "tst"."token_id"
        `;
      }

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
      if (query.tokenSetId) {
        conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
      }
      if (query.onSale === true) {
        conditions.push(`"t"."floor_sell_value" IS NOT NULL`);
      } else if (query.onSale === false) {
        conditions.push(`"t"."floor_sell_value" IS NULL`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      switch (query.sortBy) {
        case "tokenId": {
          baseQuery += ` ORDER BY "t"."token_id" ${
            query.sortDirection || "ASC"
          }`;
          break;
        }

        case "topBuyValue": {
          baseQuery += ` ORDER BY "t"."top_buy_value" ${
            query.sortDirection || "DESC"
          } NULLS LAST, "t"."token_id"`;
          break;
        }

        case "floorSellValue":
        default: {
          baseQuery += ` ORDER BY "t"."floor_sell_value" ${
            query.sortDirection || "ASC"
          } NULLS LAST, "t"."token_id"`;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          name: r.name,
          image: r.image,
          collection: {
            id: r.collection_id,
            name: r.collection_name,
          },
          topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          floorSellValue: r.floor_sell_value
            ? formatEth(r.floor_sell_value)
            : null,
        }))
      );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-tokens-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
