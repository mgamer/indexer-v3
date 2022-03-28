import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import { OrderKind } from "@/orderbook/orders";

export type Event = {
  orderKind: OrderKind;
  orderId: string;
  orderSide: "buy" | "sell";
  maker: string;
  taker: string;
  price: string;
  contract: string;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

type DbEvent = {
  address: Buffer;
  block: number;
  block_hash: Buffer;
  tx_hash: Buffer;
  tx_index: number;
  log_index: number;
  timestamp: number;
  batch_index: number;
  order_kind: OrderKind;
  order_id: string;
  order_side: "buy" | "sell";
  maker: Buffer;
  taker: Buffer;
  price: string;
  contract: Buffer;
  token_id: string;
  amount: string;
};

export const addEvents = async (events: Event[]) => {
  const fillValues: DbEvent[] = [];
  for (const event of events) {
    fillValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      order_kind: event.orderKind,
      order_id: event.orderId,
      order_side: event.orderSide,
      maker: toBuffer(event.maker),
      taker: toBuffer(event.taker),
      price: event.price,
      contract: toBuffer(event.contract),
      token_id: event.tokenId,
      amount: event.amount,
    });
  }

  const queries: string[] = [];

  if (fillValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "batch_index",
        "order_kind",
        "order_id",
        "order_side",
        "maker",
        "taker",
        "price",
        "contract",
        "token_id",
        "amount",
      ],
      { table: "fill_events_2" }
    );

    // Atomically insert the fill events and update order statuses
    queries.push(`
      WITH "x" AS (
        INSERT INTO "fill_events_2" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "batch_index",
          "order_kind",
          "order_id",
          "order_side",
          "maker",
          "taker",
          "price",
          "contract",
          "token_id",
          "amount"
        ) VALUES ${pgp.helpers.values(fillValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING "order_kind", "order_id", "timestamp"
      )
      INSERT INTO "orders" (
        "id",
        "kind",
        "fillability_status",
        "expiration"
      ) (
        SELECT
          "x"."order_id",
          "x"."order_kind",
          'filled'::order_fillability_status_t,
          to_timestamp("x"."timestamp") AS "expiration"
        FROM "x"
      )
      ON CONFLICT ("id") DO
      UPDATE SET
        "fillability_status" = 'filled',
        "expiration" = EXCLUDED."expiration",
        "updated_at" = now()
    `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await idb.none(pgp.helpers.concat(queries));
  }
};

export const removeEvents = async (block: number, blockHash: string) => {
  // Delete the fill events but skip reverting order status updates
  // since it is not possible to know what to revert to and even if
  // we knew, it might mess up other higher-level order processes.
  await idb.any(
    `
      DELETE FROM fill_events_2
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
