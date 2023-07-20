import { logger } from "@/common/logger";
import { config } from "@/config/index";
import crypto from "crypto";
import { getJoiSaleObject } from "@/common/joi";

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { OrderKind } from "@/orderbook/orders";

export type SaleWebsocketEventsTriggerQueueJobPayload = {
  data: SaleWebsocketEventInfo;
};

const changedMapping = {
  wash_trading_score: "washTradingScore",
  royalty_fee_bps: "fees.royaltyFeeBps",
  marketplace_fee_bps: "fees.marketplaceFeeBps",
  royalty_fee_breakdown: "fees.royaltyFeeBreakdown",
  marketplace_fee_breakdown: "fees.marketplaceFeeBreakdown",
  paid_full_royalty: "fees.paidFullRoyalty",
};

export class SaleWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "sale-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: SaleWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      const r = await idb.oneOrNone(
        `
        SELECT
          fill_events_2_data.*,
          tokens_data.name,
          tokens_data.image,
          tokens_data.collection_id,
          tokens_data.collection_name
      FROM (
        SELECT          
          currencies.decimals          
        FROM fill_events_2
        LEFT JOIN currencies
          ON fill_events_2.currency = currencies.contract
        WHERE
          fill_events_2.tx_hash = $/txHash/ AND fill_events_2.log_index = $/log_index/ AND fill_events_2.batch_index = $/batch_index/
      ) AS fill_events_2_data
        LEFT JOIN LATERAL (
          SELECT
            tokens.name,
            tokens.image,
            tokens.collection_id,
            collections.name AS collection_name
          FROM tokens
          LEFT JOIN collections 
            ON tokens.collection_id = collections.id
          WHERE fill_events_2_data.token_id = tokens.token_id
            AND fill_events_2_data.contract = tokens.contract
        ) tokens_data ON TRUE
       
      `,
        {
          log_index: data.after.log_index,
          batch_index: data.after.batch_index,
          txHash: data.after.tx_hash,
        }
      );

      const result = await getJoiSaleObject({
        prices: {
          gross: {
            amount: data.after.currency_price ?? data.after.price,
            nativeAmount: data.after.price,
            usdAmount: data.after.usd_price,
          },
        },
        fees: {
          royaltyFeeBps: data.after.royalty_fee_bps,
          marketplaceFeeBps: data.after.marketplace_fee_bps,
          paidFullRoyalty: data.after.paid_full_royalty,
          royaltyFeeBreakdown: data.after.royalty_fee_breakdown,
          marketplaceFeeBreakdown: data.after.marketplace_fee_breakdown,
        },
        currencyAddress: data.after.currency,
        timestamp: data.after.timestamp,
        contract: data.after.contract,
        tokenId: data.after.token_id,
        name: r.name,
        image: r.image,
        collectionId: r.collection_id,
        collectionName: r.collection_name,
        washTradingScore: data.after.wash_trading_score,
        orderId: data.after.order_id,
        orderSourceId: data.after.order_source_id_int,
        orderSide: data.after.order_side,
        orderKind: data.after.order_kind,
        maker: data.after.maker,
        taker: data.after.taker,
        amount: data.after.amount,
        fillSourceId: data.after.fill_source_id,
        block: data.after.block,
        txHash: data.after.tx_hash,
        logIndex: data.after.log_index,
        batchIndex: data.after.batch_index,
        createdAt: new Date(data.after.created_at).toISOString(),
        updatedAt: new Date(data.after.updated_at).toISOString(),
      });

      result.id = crypto
        .createHash("sha256")
        .update(
          `${fromBuffer(data.after.tx_hash)}${data.after.maker}${data.after.taker}${
            data.after.contract
          }${data.after.token_id}${data.after.price}`
        )
        .digest("hex");

      delete result.saleId;

      let eventType = "";
      const changed = [];
      if (data.trigger === "insert") eventType = "sale.created";
      else if (data.trigger === "update") {
        // if isDeleted is true, then it's a delete event
        if (r.is_deleted) eventType = "sale.deleted";
        else {
          eventType = "sale.updated";
          if (data.before) {
            for (const key in changedMapping) {
              if (data.before[key as keyof SaleInfo] !== data.after[key as keyof SaleInfo]) {
                changed.push(changedMapping[key as keyof typeof changedMapping]);
              }
            }

            if (!changed.length) {
              logger.info(
                this.queueName,
                `No changes detected for event. before=${JSON.stringify(
                  data.before
                )}, after=${JSON.stringify(data.after)}`
              );
              return;
            }
          }
        }
      }

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: fromBuffer(data.after.contract),
          maker: fromBuffer(data.after.maker),
          taker: fromBuffer(data.after.taker),
        },
        changed,
        data: result,
        offset: data.offset,
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );
      throw error;
    }
  }

  public async addToQueue(events: SaleWebsocketEventsTriggerQueueJobPayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export type EventInfo = {
  data: SaleWebsocketEventInfo;
};

interface SaleInfo {
  contract: Buffer;
  token_id: string;
  order_id: string;
  order_side: string;
  order_kind: OrderKind;
  order_source_id_int: number;
  maker: Buffer;
  taker: Buffer;
  amount: number;
  fill_source_id: number;
  block: number;
  tx_hash: Buffer;
  timestamp: number;
  price: string;
  currency: Buffer;
  currency_price: string;
  usd_price: string;
  log_index: number;
  batch_index: number;
  wash_trading_score: number;
  royalty_fee_bps: number;
  marketplace_fee_bps: number;
  royalty_fee_breakdown: string;
  marketplace_fee_breakdown: string;
  paid_full_royalty: boolean;
  is_deleted: boolean;
  updated_at: number;
  created_at: number;
}

export type SaleWebsocketEventInfo = {
  before: SaleInfo;
  after: SaleInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};

export const saleWebsocketEventsTriggerQueueJob = new SaleWebsocketEventsTriggerQueueJob();
