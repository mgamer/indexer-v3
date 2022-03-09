/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v2";

export const getUserTokensV2Options: RouteOptions = {
  description: "User tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
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
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      hasOffer: Joi.boolean(),
      sortBy: Joi.string().valid("topBuyValue"),
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
            }),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorSellValue: Joi.number().unsafe().allow(null),
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
        SELECT  tokens.contract,
                tokens.token_id,
                tokens.name,
                tokens.image,
                tokens.collection_id,
                tokens.floor_sell_id,
                tokens.top_buy_id,
                tokens.top_buy_value,
                nft_balances.amount as token_count,
                nft_balances.amount * tokens.top_buy_value AS total_buy_value,
                collections.name as collection_name,
                (
                  CASE WHEN tokens.floor_sell_value IS NOT NULL
                  THEN 1
                  ELSE 0
                  END
                ) AS on_sale_count
        FROM nft_balances
        JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
        JOIN collections ON nft_balances.contract = collections.contract
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [
        `nft_balances.owner = $/user/`,
        `nft_balances.amount > 0`,
      ];

      if (query.community) {
        conditions.push(`collections.community = $/community/`);
      }

      if (query.collection) {
        conditions.push(`tokens.collection_id = $/collection/`);
      }

      if (query.hasOffer) {
        conditions.push(`tokens.top_buy_value IS NOT NULL`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += `ORDER BY nft_balances.contract,
                             nft_balances.token_id`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      // PgPromise.as.format(baseQuery, params);
      // console.log(query);

      const result = await edb
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
              },
            },
            ownership: {
              tokenCount: String(r.token_count),
              onSaleCount: String(r.on_sale_count),
              floorSellValue: r.floor_sell_value
                ? formatEth(r.floor_sell_value)
                : null,
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
