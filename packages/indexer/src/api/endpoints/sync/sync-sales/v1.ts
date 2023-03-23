/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiSale, getJoiSaleObject } from "@/common/joi";
import { buildContinuation, regex, splitContinuation } from "@/common/utils";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getSyncSalesV1Options: RouteOptions = {
  description: "Sync Sales",
  notes:
    "This API is optimized for bulk access to sales for syncing a remote database. Thus it offers minimal filters/metadata.",
  tags: ["api", "Data Sync"],
  plugins: {
    "hapi-swagger": {
      order: 8,
    },
  },
  validate: {
    query: Joi.object({
      backfill: Joi.boolean().description(
        "Backfill: returns the sales sorted by created_at, by default they are sorted by most recently updated as this is optimized for syncing."
      ),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
    }),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(JoiSale),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getSales${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`sync-sales-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let paginationFilter = "";

    if (query.continuation) {
      const contArr = splitContinuation(query.continuation, /^(.+)_(.+)$/);

      if (contArr.length !== 2) {
        throw Boom.badRequest("Invalid continuation string used");
      }

      (query as any).createdAt = new Date(contArr[0]).toISOString();
      (query as any).updatedAt = new Date(contArr[1]).toISOString();
      if (query.backfill) {
        paginationFilter = `
        WHERE (fill_events_2.created_at) > ($/createdAt/)`;
      } else {
        paginationFilter = `
        WHERE (fill_events_2.updated_at) < ($/updatedAt/)
      `;
      }
    }

    // Default to ordering by created_at
    let queryOrderBy = "ORDER BY fill_events_2.updated_at DESC";

    if (query.backfill) {
      queryOrderBy = "ORDER BY fill_events_2.created_at ASC";
    }

    try {
      const baseQuery = `
          SELECT
            fill_events_2.contract,
            fill_events_2.token_id,
            fill_events_2.order_id,
            fill_events_2.order_side,
            fill_events_2.order_kind,
            fill_events_2.order_source_id_int,
            fill_events_2.maker,
            fill_events_2.taker,
            fill_events_2.amount,
            fill_events_2.fill_source_id,
            fill_events_2.block,
            fill_events_2.tx_hash,
            fill_events_2.timestamp,
            fill_events_2.price,
            fill_events_2.currency,
            TRUNC(fill_events_2.currency_price, 0) AS currency_price,
            currencies.decimals,
            fill_events_2.usd_price,
            fill_events_2.block,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.wash_trading_score,
            fill_events_2.royalty_fee_bps,
            fill_events_2.marketplace_fee_bps,
            fill_events_2.royalty_fee_breakdown,
            fill_events_2.marketplace_fee_breakdown,
            fill_events_2.paid_full_royalty,
            fill_events_2.updated_at,
            fill_events_2.created_at
          FROM fill_events_2
            LEFT JOIN currencies
            ON fill_events_2.currency = currencies.contract
            ${paginationFilter}
      
            ${queryOrderBy}
          LIMIT 5000;
      `;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === 1000) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].created_at +
            "_" +
            rawResult[rawResult.length - 1].updated_at
        );
      }

      const result = rawResult.map(async (r) => {
        return await getJoiSaleObject({
          prices: {
            gross: {
              amount: r.currency_price ?? r.price,
              nativeAmount: r.price,
              usdAmount: r.usd_price,
            },
          },
          fees: {
            royaltyFeeBps: r.royalty_fee_bps,
            marketplaceFeeBps: r.marketplace_fee_bps,
            paidFullRoyalty: r.paid_full_royalty,
            royaltyFeeBreakdown: r.royalty_fee_breakdown,
            marketplaceFeeBreakdown: r.marketplace_fee_breakdown,
          },
          currencyAddress: r.currency,
          timestamp: r.timestamp,
          contract: r.contract,
          tokenId: r.token_id,
          name: r.name,
          image: r.image,
          collectionId: r.collection_id,
          collectionName: r.collection_name,
          washTradingScore: r.wash_trading_score,
          orderId: r.order_id,
          orderSourceId: r.order_source_id_int,
          orderSide: r.order_side,
          orderKind: r.order_kind,
          maker: r.maker,
          taker: r.taker,
          amount: r.amount,
          fillSourceId: r.fill_source_id,
          block: r.block,
          txHash: r.tx_hash,
          logIndex: r.log_index,
          batchIndex: r.batch_index,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        });
      });

      return {
        sales: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`sync-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
