/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v3";

export const getSalesV3Options: RouteOptions = {
  description: "Historical sales",
  notes:
    "Get recent sales for a contract or token. For pagination API expect to receive the continuation from previous result",
  tags: ["api", "events"],
  validate: {
    query: Joi.object({
      // TODO: Look into optimizing filtering by collection
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/),
      limit: Joi.number().integer().min(1).max(100).default(20),
      continuation: Joi.string().pattern(/^(\d+)_(\d+)_(\d+)$/),
    })
      .oxor("contract", "token")
      .or("contract", "token"),
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
          orderSide: Joi.string().valid("ask", "bid"),
          from: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/),
          to: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/),
          amount: Joi.string(),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}$/),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
          block: Joi.number(),
        })
      ),
      continuation: Joi.string()
        .pattern(/^(\d+)_(\d+)_(\d+)$/)
        .allow(null),
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
    let paginationFilter = "";
    let tokenFilter = "";
    let collectionFilter = "";

    // Filters
    if (query.contract) {
      (query as any).contract = toBuffer(query.contract);
    }

    if (query.token) {
      const [contract, tokenId] = query.token.split(":");

      (query as any).contract = toBuffer(contract);
      (query as any).tokenId = tokenId;
      tokenFilter = `AND token_id = $/tokenId/`;
    }

    if (query.collection) {
      collectionFilter = `tokens.collection_id = $/collection/`;
    }

    if (query.continuation) {
      const [block, log_index, batch_index] = query.continuation.split("_");
      (query as any).block = block;
      (query as any).log_index = log_index;
      (query as any).batch_index = batch_index;

      paginationFilter = `AND (fill_events_2.block, fill_events_2.log_index, fill_events_2.batch_index) < ($/block/, $/log_index/, $/batch_index/)`;
    }

    try {
      const baseQuery = `
        SELECT fill_events_2_data.contract, fill_events_2_data.token_id,
               fill_events_2_data.order_side, fill_events_2_data.maker, fill_events_2_data.taker,
               fill_events_2_data.amount, fill_events_2_data.tx_hash, fill_events_2_data."timestamp",
               fill_events_2_data.price, fill_events_2_data.block, fill_events_2_data.log_index,
               fill_events_2_data.batch_index, tokens_data.name, tokens_data.image, tokens_data.collection_id,
               collections.name AS collection_name
        FROM (
          SELECT  fill_events_2.contract, fill_events_2.token_id,
                  fill_events_2.order_side, fill_events_2.maker, fill_events_2.taker,
                  fill_events_2.amount, fill_events_2.tx_hash, fill_events_2."timestamp",
                  fill_events_2.price, fill_events_2.block, fill_events_2.log_index,
                  fill_events_2.batch_index
          FROM fill_events_2
          WHERE fill_events_2.contract = $/contract/
          ${tokenFilter}
          ${paginationFilter}
          ORDER BY fill_events_2.block DESC, fill_events_2.log_index DESC, fill_events_2.batch_index DESC
          LIMIT $/limit/
        ) AS fill_events_2_data
        JOIN LATERAL (
          SELECT tokens.name, tokens.image, tokens.collection_id
          FROM tokens
          WHERE fill_events_2_data.token_id = tokens.token_id AND fill_events_2_data.contract = tokens.contract
          ${collectionFilter}
        ) tokens_data ON TRUE
        JOIN collections on fill_events_2_data.contract = collections.contract
      `;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation =
          rawResult[rawResult.length - 1].block +
          "_" +
          rawResult[rawResult.length - 1].log_index +
          "_" +
          rawResult[rawResult.length - 1].batch_index;
      }

      const result = rawResult.map((r) => ({
        token: {
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          name: r.name,
          image: r.mage,
          collection: {
            id: r.collection_id,
            name: r.collection_name,
          },
        },
        orderSide: r.order_side === "sell" ? "ask" : "bid",
        from: fromBuffer(r.maker),
        to: fromBuffer(r.taker),
        amount: String(r.amount),
        txHash: fromBuffer(r.tx_hash),
        timestamp: r.timestamp,
        price: r.price ? formatEth(r.price) : null,
        block: r.block,
      }));

      return {
        sales: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
