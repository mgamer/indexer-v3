import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { DbEvent, Event } from "@/events-sync/storage/fill-events";

export const addEventsZeroExV4 = async (events: Event[]) => {
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
      order_id: event.orderId || null,
      order_side: event.orderSide,
      maker: toBuffer(event.maker),
      taker: toBuffer(event.taker),
      price: event.price,
      contract: toBuffer(event.contract),
      token_id: event.tokenId,
      amount: event.amount,
    });
  }

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
    await idb.none(`
      WITH
        x AS (
          INSERT INTO fill_events_2 (
            address,
            block,
            block_hash,
            tx_hash,
            tx_index,
            log_index,
            timestamp,
            batch_index,
            order_kind,
            order_id,
            order_side,
            maker,
            taker,
            price,
            contract,
            token_id,
            amount
          ) VALUES ${pgp.helpers.values(fillValues, columns)}
          ON CONFLICT DO NOTHING
          RETURNING
            fill_events_2.order_kind,
            fill_events_2.order_id,
            fill_events_2.timestamp,
            fill_events_2.amount
        ),
        y AS (
          INSERT INTO orders (
            id,
            kind,
            quantity_filled,
            fillability_status,
            expiration
          ) (
            SELECT
              x.order_id,
              x.order_kind,
              x.amount,
              'filled'::order_fillability_status_t,
              to_timestamp(x.timestamp)
            FROM x
            WHERE x.order_id IS NOT NULL
          )
          ON CONFLICT (id) DO
          UPDATE SET
            fillability_status = (
              CASE
                WHEN orders.quantity_remaining <= EXCLUDED.amount THEN 'filled'
                ELSE fillability_status
              END
            ),
            quantity_remaining = orders.quantity_remaining - EXCLUDED.amount,
            quantity_filled = orders.quantity_filled + EXCLUDED.amount,
            expiration = (
              CASE
                WHEN orders.quantity_remaining <= EXCLUDED.amount THEN EXCLUDED.expiration
                ELSE expiration
              END
            ),
            updated_at = now()
          RETURNING orders.kind, orders.maker, orders.nonce, orders.fillability_status, orders.expiration
        )
        UPDATE orders SET
          fillability_status = 'cancelled',
          expiration = y.expiration,
          updated_at = now()
        FROM y
        WHERE orders.kind = y.kind
          AND orders.maker = y.maker
          AND orders.nonce = y.nonce
          AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
    `);
  }
};
