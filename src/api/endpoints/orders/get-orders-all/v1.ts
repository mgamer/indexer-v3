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
          id: Joi.string().required(),
          kind: Joi.string().required(),
          side: Joi.string().valid("buy", "sell").required(),
          fillabilityStatus: Joi.string().required(),
          approvalStatus: Joi.string().required(),
          tokenSetId: Joi.string().required(),
          tokenSetSchemaHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}$/)
            .required(),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          taker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          price: Joi.number().unsafe().required(),
          value: Joi.number().unsafe().required(),
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          sourceId: Joi.string()
            .pattern(/^0x[a-f0-9]{40}$/)
            .allow(null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string()
                  .pattern(/^0x[a-f0-9]{40}$/)
                  .allow(null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          expiration: Joi.number().required(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
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
          "o"."kind",
          "o"."side",
          "o"."fillability_status",
          "o"."approval_status",
          "o"."token_set_id",
          "o"."token_set_schema_hash",
          "o"."maker",
          "o"."taker",
          "o"."price",
          "o"."value",
          DATE_PART('epoch', LOWER("o"."valid_between")) AS "valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
            0
          ) AS "valid_until",
          "o"."source_id",
          "o"."fee_bps",
          "o"."fee_breakdown",
          COALESCE(
            NULLIF(DATE_PART('epoch', "o"."expiration"), 'Infinity'),
            0
          ) AS "expiration",
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
          kind: r.kind,
          side: r.side,
          fillabilityStatus: r.fillability_status,
          approvalStatus: r.approval_status,
          tokenSetId: r.token_set_id,
          tokenSetSchemaHash: fromBuffer(r.token_set_schema_hash),
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          price: formatEth(r.price),
          // For consistency, we set the value of "sell" orders as price - fee
          value:
            r.side === "buy"
              ? formatEth(r.value)
              : formatEth(r.value) -
                (formatEth(r.value) * Number(r.fee_bps)) / 10000,
          validFrom: Number(r.valid_from),
          validUntil: Number(r.valid_until),
          sourceId: r.source_id ? fromBuffer(r.source_id) : null,
          feeBps: Number(r.fee_bps),
          feeBreakdown: r.fee_breakdown,
          expiration: Number(r.expiration),
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
