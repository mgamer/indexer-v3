import { db, pgp } from "@/common/db";
import { BaseParams } from "@/events/parser";

type OrderKind = "wyvern-v2";

export type CancelEvent = {
  orderHash: string;
  baseParams: BaseParams;
};

export const addCancelEvents = async (
  orderKind: OrderKind,
  cancelEvents: CancelEvent[]
) => {
  const cancelValues: any[] = [];
  for (const ce of cancelEvents) {
    cancelValues.push({
      order_hash: ce.orderHash,
      address: ce.baseParams.address,
      block: ce.baseParams.block,
      block_hash: ce.baseParams.blockHash,
      tx_hash: ce.baseParams.txHash,
      log_index: ce.baseParams.logIndex,
    });
  }

  let cancelInsertsQuery: string | undefined;
  if (cancelValues) {
    const columns = new pgp.helpers.ColumnSet(
      ["order_hash", "address", "block", "block_hash", "tx_hash", "log_index"],
      { table: "cancel_events" }
    );
    const values = pgp.helpers.values(cancelValues, columns);

    if (values.length) {
      // Atomically insert the cancel events and update order status
      cancelInsertsQuery = `
        with "x" as (
          insert into "cancel_events" (
            "order_hash",
            "address",
            "block",
            "block_hash",
            "tx_hash",
            "log_index"
          ) values ${values}
          on conflict do nothing
          returning "order_hash"
        )
        insert into "orders" (
          "hash",
          "kind",
          "status"
        ) ( 
          select
            "x"."order_hash",
            $/kind/::order_kind_t,
            'cancelled'::order_status_t
          from "x"
        ) on conflict ("hash") do update
        set "status" = 'cancelled';
      `;
    }
  }

  const queries: any[] = [];
  if (cancelInsertsQuery) {
    queries.push({
      query: cancelInsertsQuery,
      values: {
        kind: orderKind,
      },
    });
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeCancelEvents = async (blockHash: string) => {
  // We should also revert the status of the affected orders when
  // removing cancel events. However, that's tricky since we cannot
  // know what to revert to (eg. 'valid' or 'expired') and it might
  // also mess up other higher-level order processes. So we simply
  // skip reverting since there's probably going to be very few
  // cases when a cancel is permanently orphaned (eg. 99.99% of the
  // time, the cancel will be reincluded in a future block).

  await db.any(
    `delete from "cancel_events" where "block_hash" = $/blockHash/`,
    { blockHash }
  );
};
