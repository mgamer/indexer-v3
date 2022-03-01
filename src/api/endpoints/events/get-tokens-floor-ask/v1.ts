import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensFloorAskV1Options: RouteOptions = {
  description: "Retrieve events on token floor ask changes.",
  tags: ["api", "events"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}/),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/),
      startTimestamp: Joi.number().required(),
      endTimestamp: Joi.number().required(),
      continuation: Joi.string().pattern(/^\d+(.\d+)?_\d+$/),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    }).oxor("contract", "token"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          kind: Joi.string().valid(
            "new-order",
            "expiry",
            "sale",
            "cancel",
            "balance-change",
            "approval-change",
            "bootstrap"
          ),
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}/),
          tokenId: Joi.string().pattern(/^[0-9]+$/),
          orderId: Joi.string().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}/)
            .allow(null),
          price: Joi.number().unsafe().allow(null),
          previousPrice: Joi.number().unsafe().allow(null),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}/)
            .allow(null),
          txTimestamp: Joi.number().allow(null),
          createdAt: Joi.string(),
        })
      ),
      continuation: Joi.string()
        .pattern(/^\d+(.\d+)?_\d+$/)
        .allow(null),
    }).label(`getTokensFloorAsk${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-floor-ask-${version}-handler`,
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
          "e"."id",
          "e"."kind",
          "e"."contract",
          "e"."token_id",
          "e"."order_id",
          "e"."maker",
          "e"."price",
          "e"."previous_price",
          "e"."tx_hash",
          "e"."tx_timestamp",
          extract(epoch from "e"."created_at") AS "created_at"
        FROM "token_floor_sell_events" "e"
      `;

      // Filters
      const conditions: string[] = [
        `"e"."created_at" >= to_timestamp($/startTimestamp/)`,
        `"e"."created_at" <= to_timestamp($/endTimestamp/)`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"e"."contract" = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`"e"."contract" = $/contract/`);
        conditions.push(`"e"."token_id" = $/tokenId/`);
      }
      if (query.continuation) {
        const [createdAt, id] = query.continuation.split("_");
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `("e"."created_at", "e"."id") > (to_timestamp($/createdAt/), $/id/)`
        );
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "e"."created_at", "e"."id"`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await db.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation =
          rawResult[rawResult.length - 1].created_at +
          "_" +
          rawResult[rawResult.length - 1].id;
      }

      const result = rawResult.map((r) => ({
        kind: r.kind,
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        orderId: r.order_id,
        maker: r.maker ? fromBuffer(r.maker) : null,
        price: r.price ? formatEth(r.price) : null,
        previousPrice: r.previous_price ? formatEth(r.previous_price) : null,
        txHash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
        txTimestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
        createdAt: new Date(r.created_at * 1000).toISOString(),
      }));

      return {
        events: result,
        continuation,
      };
    } catch (error) {
      logger.error(
        `get-orders-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
