import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getSalesV1Options: RouteOptions = {
  description:
    "Get historical sales. Can filter by collection, attribute or token.",
  tags: ["api", "transfers"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract")
      .with("tokenId", "contract"),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-f0-9]{40}$/),
            tokenId: Joi.string().pattern(/^[0-9]+$/),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
          }),
          from: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/),
          to: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/),
          amount: Joi.number(),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}$/),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getSales${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-sales-${version}-handler`,
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
          "fe"."contract",
          "fe"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "c"."name" AS "collection_name",
          "fe"."maker",
          "fe"."taker",
          "fe"."amount",
          "fe"."tx_hash",
          "fe"."timestamp",
          "fe"."price"
        FROM "fill_events_2" "fe"
        JOIN "tokens" "t"
          ON "fe"."contract" = "t"."contract"
          AND "fe"."token_id" = "t"."token_id"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
      `;

      // Filters
      const conditions: string[] = [];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"fe"."contract" = $/contract/`);
      }
      if (query.tokenId) {
        conditions.push(`"fe"."token_id" = $/tokenId/`);
      }
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "fe"."block" DESC`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          token: {
            contract: fromBuffer(r.address),
            tokenId: r.token_id,
            name: r.name,
            image: r.mage,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
          },
          from: fromBuffer(r.from),
          to: fromBuffer(r.to),
          amount: Number(r.amount),
          txHash: fromBuffer(r.tx_hash),
          timestamp: r.timestamp,
          price: r.price ? formatEth(r.price) : null,
        }))
      );

      return { sales: result };
    } catch (error) {
      logger.error(`get-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
