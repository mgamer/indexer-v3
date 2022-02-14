import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";

const version = "v1";

export const getOrderV1Options: RouteOptions = {
  description: "Get a list of orders.",
  tags: ["api", "orders"],
  validate: {
    params: Joi.object({
      id: Joi.string().required(),
    }),
  },
  response: {
    schema: Joi.object({
      order: Joi.object({
        id: Joi.string().required(),
        kind: Joi.string().required(),
        side: Joi.string().valid("buy", "sell").required(),
        fillabilityStatus: Joi.string().required(),
        approvalStatus: Joi.string().required(),
        tokenSetId: Joi.string().required(),
        tokenSetSchemaHash: Joi.string().required(),
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
        sourceInfo: Joi.any(),
        royaltyInfo: Joi.any(),
        rawData: Joi.any(),
        expiration: Joi.number().required(),
        createdAt: Joi.string().required(),
        updatedAt: Joi.string().required(),
      }).allow(null),
    }).label(`getOrder${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-order-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const baseQuery = `
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
          "o"."source_info",
          "o"."royalty_info",
          "o"."expiration",
          "o"."created_at",
          "o"."updated_at",
          "o"."raw_data"
        FROM "orders" "o"
        WHERE "o"."id" = $/id/
      `;

      const result = await db.oneOrNone(baseQuery, params).then(
        (r) =>
          r && {
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
            value: formatEth(r.value),
            validFrom: Number(r.valid_from),
            validUntil: Number(r.valid_until),
            sourceInfo: r.source_info,
            royaltyInfo: r.royalty_info,
            expiration: Number(r.expiration),
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            rawData: r.raw_data,
          }
      );

      return { order: result };
    } catch (error) {
      logger.error(`get-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
