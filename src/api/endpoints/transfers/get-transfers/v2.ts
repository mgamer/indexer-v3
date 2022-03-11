/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v2";

export const getTransfersV2Options: RouteOptions = {
  description: "Historical token transfers",
  notes: "Get recent transfers for a contract or token.",
  tags: ["api", "events"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/),
      limit: Joi.number().integer().min(1).max(100).default(20),
      continuation: Joi.number().integer().default(0),
    })
      .oxor("contract", "token")
      .or("contract", "token"),
  },
  response: {
    schema: Joi.object({
      transfers: Joi.array().items(
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
          amount: Joi.string(),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}$/),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
      continuation: Joi.number().allow(null),
    }).label(`getTransfers${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-transfers-${version}-handler`,
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
          nft_transfer_events.address, nft_transfer_events.token_id,
          tokens.name, tokens.image, tokens.collection_id,
          collections.name as collection_name, nft_transfer_events."from",
          nft_transfer_events."to", nft_transfer_events.amount, nft_transfer_events.tx_hash,
          nft_transfer_events."timestamp", nft_transfer_events.block,
          (
            SELECT fill_events_2.price
            FROM fill_events_2
            WHERE fill_events_2.tx_hash = nft_transfer_events.tx_hash
            AND fill_events_2.log_index = nft_transfer_events.log_index + 1
            LIMIT 1
          ) AS price
        FROM nft_transfer_events
        JOIN tokens ON nft_transfer_events.address = tokens.contract AND nft_transfer_events.token_id = tokens.token_id
        JOIN collections ON tokens.collection_id = collections.id
      `;

      // Filters
      const conditions: string[] = [];
      if (query.collection) {
        conditions.push(`collections.id = $/collection/`);
      }

      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`nft_transfer_events."address" = $/contract/`);
      }

      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`tokens."contract" = $/contract/`);
        conditions.push(`tokens."token_id" = $/tokenId/`);
      }

      if (query.continuation) {
        conditions.push(`nft_transfer_events.block < $/continuation/`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY nft_transfer_events.block DESC`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = rawResult[rawResult.length - 1].block;
      }

      const result = rawResult.map((r) => ({
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
        amount: String(r.amount),
        txHash: fromBuffer(r.tx_hash),
        timestamp: r.timestamp,
        price: r.price ? formatEth(r.price) : null,
      }));

      return {
        transfers: result,
        continuation,
      };
    } catch (error) {
      logger.error(
        `get-transfers-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
