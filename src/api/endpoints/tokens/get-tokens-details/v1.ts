import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensDetailsV1Options: RouteOptions = {
  description: "Get tokens details.",
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
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("contract", "collection", "tokenSetId")
      .oxor("contract", "collection", "tokenSetId"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-f0-9]{40}$/)
              .required(),
            tokenId: Joi.string()
              .pattern(/^[0-9]+$/)
              .required(),
            name: Joi.string().allow(null, ""),
            description: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            owner: Joi.string().required(),
            attributes: Joi.array().items(
              Joi.object({
                key: Joi.string(),
                value: Joi.string(),
              })
            ),
          }),
          market: Joi.object({
            floorSell: {
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-f0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
            },
            topBuy: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-f0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
            }),
          }),
        })
      ),
    }).label(`getTokensDetails${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-details-${version}-handler`,
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
          "t"."description",
          "t"."image",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "t"."last_buy_value",
          "t"."last_buy_timestamp",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          date_part('epoch', lower("t"."floor_sell_valid_between")) AS "floor_sell_valid_from",
          coalesce(
            nullif(date_part('epoch', upper("t"."floor_sell_valid_between")), 'Infinity'),
            0
          ) AS "floor_sell_valid_until",
          "t"."top_buy_id",
          "t"."top_buy_value",
          "t"."top_buy_maker",
          date_part('epoch', lower("t"."top_buy_valid_between")) AS "top_buy_valid_from",
          coalesce(
            nullif(date_part('epoch', upper("t"."top_buy_valid_between")), 'Infinity'),
            0
          ) AS "top_buy_valid_until"
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
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            name: r.name,
            description: r.description,
            image: r.image,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            lastSell: {
              value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
              timestamp: r.last_sell_timestamp,
            },
            owner: fromBuffer(r.owner),
            // TODO: Integrate attributes once available
            attributes: [],
          },
          market: {
            floorSell: {
              id: r.floor_sell_id,
              value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_valid_from,
              validUntil: r.floor_sell_valid_until,
            },
            topBuy: {
              id: r.top_buy_id,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
              validFrom: r.top_buy_valid_from,
              validUntil: r.top_buy_valid_until,
            },
          },
        }))
      );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-tokens-details-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
