import { db, pgp } from "@/common/db";
import { BaseEventParams } from "@/events-sync/parser";

// TODO: Support for than one kind (for now, `wyvern-v2`)
export type Event = {
  buyOrderId: string;
  sellOrderId: string;
  maker: Buffer;
  taker: Buffer;
  price: string;
  baseEventParams: BaseEventParams;
};

export const addEvents = async (events: Event[]) => {
  const fillValues: any[] = [];
  for (const event of events) {
    fillValues.push({
      address: event.baseEventParams.address,
      block: event.baseEventParams.block,
      block_hash: event.baseEventParams.blockHash,
      tx_hash: event.baseEventParams.txHash,
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      buy_order_id: event.buyOrderId,
      sell_order_id: event.sellOrderId,
      maker: event.maker,
      taker: event.taker,
      price: event.price,
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
        "buy_order_id",
        "sell_order_id",
        "maker",
        "taker",
        "price",
      ],
      { table: "fill_events" }
    );

    // Atomically insert the fill events and update order statuses
    queries.push(`
      WITH "x" AS (
        INSERT INTO "fill_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "buy_order_id",
          "sell_order_id",
          "maker",
          "taker",
          "price"
        ) VALUES ${pgp.helpers.values(fillValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING
            array["buy_order_id", "sell_order_id"] as "order_ids",
            "timestamp"
      )
      INSERT INTO "orders" (
        "id",
        "kind",
        "fillability_status",
        "expiration",
        "created_at",
        "updated_at"
      ) (
        SELECT
          "y"."order_id",
          'wyvern-v2'::order_kind_t,
          'filled'::order_fillability_status_t,
          to_timestamp(min("y"."timestamp")) as "expiration",
          now(),
          now()
        FROM (
          SELECT
            unnest("x"."order_ids") as "order_id",
            "x"."timestamp"
          FROM "x"
        ) "y"
        GROUP BY "y"."order_id"
      )
      ON CONFLICT ("id") DO
      UPDATE SET
        "fillability_status" = 'filled',
        "expiration" = EXCLUDED."expiration",
        updated_at = now()
    `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeEvents = async (blockHash: Buffer) => {
  // Delete the fill events but skip reverting order status updates
  // since it is not possible to know what to revert to and even if
  // we knew, it might mess up other higher-level order processes.
  await db.any(`DELETE FROM "fill_events" WHERE "block_hash" = $/blockHash/`, {
    blockHash,
  });
};
