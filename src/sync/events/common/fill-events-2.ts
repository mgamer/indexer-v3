import { db, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";

// TODO: Support for than one kind (for now, `wyvern-v2`)
export type Event = {
  orderId: string;
  maker: string;
  taker: string;
  price: string;
  contract: string;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

export const addEvents = async (events: Event[]) => {
  const fillValues: any[] = [];
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
      order_id: event.orderId,
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
        "order_id",
        "maker",
        "taker",
        "price",
        "contract",
        "token_id",
        "amount",
      ],
      { table: "fill_events_2" }
    );

    // TODO: To avoid any deadlocks when updating the order statuses
    // disable order updates when writing to the new fills table. To
    // revert once we get rid of the old fill events table.

    queries.push(`
      INSERT INTO "fill_events_2" (
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "batch_index",
        "order_id",
        "maker",
        "taker",
        "price",
        "contract",
        "token_id",
        "amount"
      ) VALUES ${pgp.helpers.values(fillValues, columns)}
      ON CONFLICT DO NOTHING
    `);

    // // Atomically insert the fill events and update order statuses
    // queries.push(`
    //   WITH "x" AS (
    //     INSERT INTO "fill_events_2" (
    //       "address",
    //       "block",
    //       "block_hash",
    //       "tx_hash",
    //       "tx_index",
    //       "log_index",
    //       "timestamp",
    //       "batch_index",
    //       "order_id",
    //       "maker",
    //       "taker",
    //       "price",
    //       "contract",
    //       "token_id",
    //       "amount"
    //     ) VALUES ${pgp.helpers.values(fillValues, columns)}
    //     ON CONFLICT DO NOTHING
    //     RETURNING "order_id", "timestamp"
    //   )
    //   INSERT INTO "orders" (
    //     "id",
    //     "kind",
    //     "fillability_status",
    //     "expiration",
    //     "created_at",
    //     "updated_at"
    //   ) (
    //     SELECT
    //       "x"."order_id",
    //       'wyvern-v2'::order_kind_t,
    //       'filled'::order_fillability_status_t,
    //       to_timestamp("x"."timestamp") AS "expiration",
    //       NOW(),
    //       NOW()
    //     FROM "x"
    //   )
    //   ON CONFLICT ("id") DO
    //   UPDATE SET
    //     "fillability_status" = 'filled',
    //     "expiration" = EXCLUDED."expiration",
    //     "updated_at" = NOW()
    // `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeEvents = async (blockHash: string) => {
  // Delete the fill events but skip reverting order status updates
  // since it is not possible to know what to revert to and even if
  // we knew, it might mess up other higher-level order processes.
  await db.any(
    `DELETE FROM "fill_events_2" WHERE "block_hash" = $/blockHash/`,
    {
      blockHash: toBuffer(blockHash),
    }
  );
};
