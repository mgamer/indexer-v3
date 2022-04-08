/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  base64Regex,
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  toBuffer,
} from "@/common/utils";

const version = "v1";

export const getOrdersAllV1Options: RouteOptions = {
  description: "Bulk access to raw orders",
  notes:
    "This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "1. Order Book"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      source: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      continuation: Joi.string().pattern(base64Regex),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    })
      .or("contract", "source")
      .oxor("contract", "source"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          kind: Joi.string().required(),
          side: Joi.string().valid("buy", "sell").required(),
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
          rawData: Joi.object(),
        })
      ),
      continuation: Joi.string().pattern(base64Regex).allow(null),
    }).label(`getOrdersAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-all-${version}-handler`, `Wrong response schema: ${error}`);
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
          extract(epoch from "o"."created_at") AS "created_at",
          "o"."updated_at",
          "o"."raw_data"
        FROM "orders" "o"
      `;

      // Filters
      const conditions: string[] = [`"o"."contract" IS NOT NULL`];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"o"."contract" = $/contract/`);
      }
      if (query.source) {
        if (query.source === AddressZero) {
          conditions.push(`coalesce("o"."source_id", '\\x00') = '\\x00'`);
        } else {
          (query as any).source = toBuffer(query.source);
          conditions.push(`coalesce("o"."source_id", '\\x00') = $/source/`);
        }
      }

      if (query.continuation) {
        const [createdAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(`("o"."created_at", "o"."id") < (to_timestamp($/createdAt/), $/id/)`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "o"."created_at" DESC, "o"."id" DESC`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
        );
      }

      const result = rawResult.map((r) => ({
        id: r.id,
        kind: r.kind,
        side: r.side,
        tokenSetId: r.token_set_id,
        tokenSetSchemaHash: fromBuffer(r.token_set_schema_hash),
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        price: formatEth(r.price),
        // For consistency, we set the value of "sell" orders as price - fee
        value:
          r.side === "buy"
            ? formatEth(r.value)
            : formatEth(r.value) - (formatEth(r.value) * Number(r.fee_bps)) / 10000,
        validFrom: Number(r.valid_from),
        validUntil: Number(r.valid_until),
        sourceId: r.source_id ? fromBuffer(r.source_id) : null,
        feeBps: Number(r.fee_bps),
        feeBreakdown: r.fee_breakdown,
        expiration: Number(r.expiration),
        createdAt: new Date(r.created_at * 1000).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        rawData: r.raw_data,
      }));

      return {
        orders: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-orders-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
