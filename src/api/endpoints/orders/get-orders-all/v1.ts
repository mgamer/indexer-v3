import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";

const version = "v1";

export const getOrdersAllV1Options: RouteOptions = {
  description: "Get all valid orders by side sorted by their creation date.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      side: Joi.string().lowercase().valid("buy", "sell"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      continuation: Joi.string().pattern(/^\d+_0x[a-f0-9]{64}$/),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    }),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          tokenSetId: Joi.string(),
          schema: Joi.any(),
          metadata: Joi.any(),
          kind: Joi.string().valid("wyvern-v2"),
          side: Joi.string().valid("buy", "sell"),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/),
          price: Joi.number().unsafe(),
          value: Joi.number().unsafe(),
          validFrom: Joi.number(),
          validUntil: Joi.number(),
          sourceInfo: Joi.any(),
          royaltyInfo: Joi.any(),
          createdAt: Joi.string(),
          updatedAt: Joi.string(),
          rawData: Joi.any(),
        })
      ),
      continuation: Joi.string()
        .pattern(/^\d+_0x[a-f0-9]{64}$/)
        .allow(null),
    }).label(`getOrdersAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-orders-all-${version}-handler`,
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
          "o"."id",
          "o"."token_set_id",
          "o"."kind",
          "o"."side",
          "o"."maker",
          "o"."price",
          "o"."value",
          DATE_PART('epoch', LOWER("o"."valid_between")) AS "valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
            0
          ) AS "valid_until",
          "o"."source_info",
          "o"."royalty_info",
          "o"."created_at",
          "o"."updated_at",
          "o"."raw_data"
        FROM "orders" "o"
      `;

      // Filters
      const conditions: string[] = [
        `"o"."fillability_status" = 'fillable'`,
        `"o"."approval_status" = 'approved'`,
      ];
      if (query.side) {
        conditions.push(`"o"."side" = $/side/`);
      }
      if (query.continuation) {
        const [createdAt, id] = query.continuation.split("_");
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `("o"."created_at", "o"."id") ${
            (query.sortDirection || "asc") === "asc" ? ">" : "<"
          } (to_timestamp($/createdAt/ / 1000.0), $/id/)`
        );
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += `
        ORDER BY
          "o"."created_at" ${query.sortDirection || "ASC"},
          "o"."id" ${query.sortDirection || "ASC"}
      `;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          id: r.id,
          tokenSetId: r.token_set_id,
          kind: r.kind,
          side: r.side,
          maker: fromBuffer(r.maker),
          price: formatEth(r.price),
          value: formatEth(r.value),
          validFrom: Number(r.valid_from),
          validUntil: Number(r.valid_until),
          sourceInfo: r.source_info,
          royaltyInfo: r.royalty_info,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          rawData: r.raw_data,
        }))
      );

      let continuation = null;
      if (result.length === query.limit) {
        // TODO: By default Postgres stores any timestamps at a microsecond
        // precision. However, NodeJS's Date type can only handle precision
        // at millisecond level. The code below assumes that there exist no
        // orders created at the same millisecond but different microsecond
        // when building the continuation token. However, this might not be
        // always true so we should either include microsecond precision in
        // the continuation tokens or store all timestamps at a millisecond
        // precision in Postgres.
        continuation =
          new Date(result[result.length - 1].createdAt).getTime() +
          "_" +
          result[result.length - 1].id;
      }

      return {
        orders: result,
        continuation,
      };
    } catch (error) {
      logger.error(
        `get-orders-all-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
