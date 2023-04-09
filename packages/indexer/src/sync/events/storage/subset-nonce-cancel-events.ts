import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { OrderKind } from "@/orderbook/orders";

export type Event = {
  orderKind: OrderKind;
  maker: string;
  nonce: string;
  baseEventParams: BaseEventParams;
  isSubset?: boolean;
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
  maker: Buffer;
  nonce: string;
};

function generateUpdateQuery(nonceCancelValues: DbEvent[]) {
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
      "maker",
      "nonce",
    ],
    { table: "subset_nonce_events" }
  );

  // Atomically insert the nonce cancel events and update order statuses.
  // return `INSERT INTO "subset_nonce_events" (
  //   "address",
  //   "block",
  //   "block_hash",
  //   "tx_hash",
  //   "tx_index",
  //   "log_index",
  //   "timestamp",
  //   "batch_index",
  //   "order_kind",
  //   "maker",
  //   "nonce"
  // ) VALUES ${pgp.helpers.values(nonceCancelValues, columns)}
  // ON CONFLICT DO NOTHING
  // RETURNING "order_kind", "maker", "nonce", "tx_hash", "timestamp", "log_index", "batch_index", "block_hash"`
  return `
    WITH "x" AS (
      INSERT INTO "subset_nonce_events" (
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "batch_index",
        "order_kind",
        "maker",
        "nonce"
      ) VALUES ${pgp.helpers.values(nonceCancelValues, columns)}
      ON CONFLICT DO NOTHING
      RETURNING "order_kind", "maker", "nonce", "tx_hash", "timestamp", "log_index", "batch_index", "block_hash"
    )
    SELECT 
      "o"."raw_data"->>'subsetNonce' as subset_nonce, 
      "o"."id",
      "o"."maker",
      "o"."kind" AS "order_kind", 
      "o"."nonce", 
      "x"."tx_hash", 
      "x"."timestamp", 
      "x"."log_index", 
      "x"."batch_index",
      "x"."block_hash"
    FROM "orders" AS "o", "x"
    WHERE "o"."kind" = "x"."order_kind"
      AND "o"."maker" = "x"."maker"
      AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
  `;
}

export const addEvents = async (events: Event[], backfill = false) => {
  const nonceCancelValues: DbEvent[] = [];
  for (const event of events) {
    const dbEvent = {
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      order_kind: event.orderKind,
      maker: toBuffer(event.maker),
      nonce: event.nonce,
    };

    nonceCancelValues.push(dbEvent);
  }

  let query: string | undefined;

  if (nonceCancelValues.length) {
    query = generateUpdateQuery(nonceCancelValues);
  }

  if (query) {
    const allOrders = await idb.manyOrNone(query);
    const effectedOrders = allOrders
      .map((c) => {
        c.maker = fromBuffer(c.maker);
        return c;
      })
      .filter((c) => {
        const macthed = events.find((d) => d.maker === c.maker && d.orderKind === c.order_kind);
        return c.subset_nonce == macthed?.nonce;
      });

    const updateValues = effectedOrders.map((_) => {
      return {
        id: _.id,
        timestamp: _.timestamp,
      };
    });

    const columns = new pgp.helpers.ColumnSet(["id", "timestamp"], {
      table: "orders",
    });

    // Update in bacth
    const updateResult = await idb.manyOrNone(`
      UPDATE orders SET
        "fillability_status" = 'cancelled',
        "expiration" = to_timestamp("x"."timestamp"),
        "updated_at" = now()
      FROM (
        VALUES ${pgp.helpers.values(updateValues, columns)}
      ) AS x(id, timestamp)
      WHERE orders.id = x.id
      RETURNING orders.id
    `);

    const result = updateResult.map((c) => {
      return effectedOrders.find((d) => d.id === c.id);
    });

    if (!backfill) {
      // TODO: Ideally, we should trigger all further processing
      // pipelines one layer higher but for now we can just have
      // it here. We should also run the order status updates in
      // a job queue (since we can potentially have an unbounded
      // number of orders that need status updates and executing
      // it synchronously is not ideal).
      await orderUpdatesById.addToQueue(
        result.map(
          ({ id, tx_hash, timestamp, log_index, batch_index, block_hash }) =>
            ({
              context: `cancelled-${id}`,
              id,
              trigger: {
                kind: "cancel",
                txHash: fromBuffer(tx_hash),
                txTimestamp: timestamp,
                logIndex: log_index,
                batchIndex: batch_index,
                blockHash: fromBuffer(block_hash),
              },
            } as orderUpdatesById.OrderInfo)
        )
      );
    }
  }
};

export const removeEvents = async (block: number, blockHash: string) => {
  // Delete the cancel events but skip reverting order status updates
  // since it's not possible to know what to revert to and even if we
  // knew, it might mess up other higher-level order processes.
  await idb.any(
    `
      DELETE FROM subset_nonce_events
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
