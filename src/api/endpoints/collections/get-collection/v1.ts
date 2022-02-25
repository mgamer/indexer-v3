import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";

const version = "v1";

export const getCollectionV1Options: RouteOptions = {
  description:
    "Get a single collection. Returns more detailed information, and real-time stats.",
  tags: ["api", "collections"],
  validate: {
    params: Joi.object({
      collectionOrSlug: Joi.string().lowercase().required(),
    }),
  },
  response: {
    schema: Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        slug: Joi.string(),
        name: Joi.string().allow(null, ""),
        metadata: Joi.any().allow(null),
        sampleImages: Joi.array().items(Joi.string().allow(null, "")),
        tokenCount: Joi.number(),
        onSaleCount: Joi.number(),
        tokenSetId: Joi.string().allow(null),
        royalties: Joi.object({
          recipient: Joi.string().allow(null, ""),
          bps: Joi.number(),
        }),
        lastBuy: {
          value: Joi.number().unsafe().allow(null),
          timestamp: Joi.number().allow(null),
        },
        lastSell: {
          value: Joi.number().unsafe().allow(null),
          timestamp: Joi.number().allow(null),
        },
        floorAsk: {
          id: Joi.string().allow(null),
          price: Joi.number().unsafe().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .allow(null),
          validFrom: Joi.number().unsafe().allow(null),
          validUntil: Joi.number().unsafe().allow(null),
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-f0-9]{40}$/)
              .allow(null),
            tokenId: Joi.string()
              .pattern(/^[0-9]+$/)
              .allow(null),
            name: Joi.string().allow(null),
            image: Joi.string().allow(null, ""),
          }).allow(null),
        },
        topBid: Joi.object({
          id: Joi.string().allow(null),
          value: Joi.number().unsafe().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .allow(null),
          validFrom: Joi.number().unsafe().allow(null),
          validUntil: Joi.number().unsafe().allow(null),
        }),
      }).allow(null),
    }).label(`getCollection${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      let baseQuery = `
        SELECT
          "c"."id",
          "c"."slug",
          "c"."name",
          "c"."metadata",
          "c"."royalties",
          "c"."token_set_id",
          "c"."token_count",
          (
            SELECT COUNT(*) FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
              AND "t"."floor_sell_value" IS NOT NULL
          ) AS "on_sale_count",
          ARRAY(
            SELECT "t"."image" FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
            LIMIT 4
          ) AS "sample_images"
        FROM "collections" "c"
      `;

      // If `collectionOrSlug` matches a contract address then we
      // assume the search is by collection id, otherwise it must
      // be a search by slug.
      if (params.collectionOrSlug.match(/0x[a-f0-9]{40}/g)) {
        baseQuery += ` WHERE "c"."id" = $/collectionOrSlug/`;
      } else {
        baseQuery += ` WHERE "c"."slug" = $/collectionOrSlug/`;
      }

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          "y".*,
          "z".*
        FROM "x"
        LEFT JOIN LATERAL (
          SELECT
            "t"."contract" AS "floor_sell_token_contract",
            "t"."token_id" AS "floor_sell_token_id",
            "t"."name" AS "floor_sell_token_name",
            "t"."image" AS "floor_sell_token_image",
            "t"."floor_sell_id",
            "t"."floor_sell_value",
            "t"."floor_sell_maker",
            DATE_PART('epoch', LOWER("o"."valid_between")) AS "floor_sell_valid_from",
              COALESCE(
                NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
                0
              ) AS "floor_sell_valid_until",
            "t"."last_sell_value",
            "t"."last_sell_timestamp"
          FROM "tokens" "t"
          LEFT JOIN "orders" "o"
            ON "t"."floor_sell_id" = "o"."id"
          WHERE "t"."collection_id" = "x"."id"
          ORDER BY "t"."floor_sell_value"
          LIMIT 1
        ) "y" ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            "ts"."top_buy_id",
            "ts"."top_buy_value",
            "ts"."top_buy_maker",
            DATE_PART('epoch', LOWER("o"."valid_between")) AS "top_buy_valid_from",
            COALESCE(
              NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
              0
            ) AS "top_buy_valid_until",
            "ts"."last_buy_value",
            "ts"."last_buy_timestamp"
          FROM "token_sets" "ts"
          LEFT JOIN "orders" "o"
            ON "ts"."top_buy_id" = "o"."id"
          WHERE "ts"."id" = "x"."token_set_id"
          ORDER BY "ts"."top_buy_value" DESC NULLS LAST
          LIMIT 1
        ) "z" ON TRUE
      `;

      const result = await db.oneOrNone(baseQuery, params).then((r) =>
        !r
          ? null
          : {
              id: r.id,
              slug: r.slug,
              name: r.name,
              metadata: r.metadata,
              sampleImages: r.sample_images || [],
              tokenCount: Number(r.token_count),
              onSaleCount: Number(r.on_sale_count),
              tokenSetId: r.token_set_id,
              royalties: r.royalties ? r.royalties[0] : null,
              lastBuy: {
                value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                timestamp: r.last_buy_timestamp,
              },
              lastSell: {
                value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
                timestamp: r.last_sell_timestamp,
              },
              floorAsk: {
                id: r.floor_sell_id,
                price: r.floor_sell_value
                  ? formatEth(r.floor_sell_value)
                  : null,
                maker: r.floor_sell_maker
                  ? fromBuffer(r.floor_sell_maker)
                  : null,
                validFrom: r.floor_sell_valid_from,
                validUntil: r.floor_sell_value
                  ? r.floor_sell_valid_until
                  : null,
                token: r.floor_sell_value && {
                  contract: r.floor_sell_token_contract
                    ? fromBuffer(r.floor_sell_token_contract)
                    : null,
                  tokenId: r.floor_sell_token_id,
                  name: r.floor_sell_token_name,
                  image: r.floor_sell_token_image,
                },
              },
              topBid: {
                id: r.top_buy_id,
                value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                validFrom: r.top_buy_valid_from,
                validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
              },
            }
      );

      return { collection: result };
    } catch (error) {
      logger.error(
        `get-collection-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
