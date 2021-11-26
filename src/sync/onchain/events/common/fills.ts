import { db, pgp } from "@/common/db";
import { BaseParams } from "@/events/parser";

type OrderKind = "wyvern-v2";

export type FillEvent = {
  buyHash: string;
  sellHash: string;
  maker: string;
  taker: string;
  price: string;
  baseParams: BaseParams;
};

export const addFillEvents = async (
  orderKind: OrderKind,
  fillEvents: FillEvent[]
) => {
  const fillValues: any[] = [];
  for (const fe of fillEvents) {
    fillValues.push({
      buy_order_hash: fe.buyHash,
      sell_order_hash: fe.sellHash,
      maker: fe.maker,
      taker: fe.taker,
      price: fe.price,
      address: fe.baseParams.address,
      block: fe.baseParams.block,
      block_hash: fe.baseParams.blockHash,
      tx_hash: fe.baseParams.txHash,
      tx_index: fe.baseParams.txIndex,
      log_index: fe.baseParams.logIndex,
    });
  }

  let fillInsertsQuery: string | undefined;
  if (fillValues) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "buy_order_hash",
        "sell_order_hash",
        "maker",
        "taker",
        "price",
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
      ],
      { table: "fill_events" }
    );
    const values = pgp.helpers.values(fillValues, columns);

    if (values.length) {
      // Atomically insert the fill events and update order status
      fillInsertsQuery = `
        with "x" as (
          insert into "fill_events" (
            "buy_order_hash",
            "sell_order_hash",
            "maker",
            "taker",
            "price",
            "address",
            "block",
            "block_hash",
            "tx_hash",
            "tx_index",
            "log_index"
          ) values ${values}
          on conflict do nothing
          returning
            array["buy_order_hash", "sell_order_hash"] as "order_hashes"
        )
        insert into "orders" (
          "hash",
          "kind",
          "status"
        ) (
          select
            "y"."order_hash",
            $/kind/::order_kind_t,
            'filled'::order_status_t
          from (
            select
              unnest("order_hashes") as "order_hash"
            from "x"
          ) "y"
          group by "y"."order_hash"
        ) on conflict ("hash") do update
        set "status" = 'filled';
      `;
    }
  }

  const queries: any[] = [];
  if (fillInsertsQuery) {
    queries.push({
      query: fillInsertsQuery,
      values: {
        kind: orderKind,
      },
    });
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }
};

export const removeFillEvents = async (blockHash: string) => {
  // We should also revert the status of the affected orders when
  // removing fill events. However, that's tricky since we cannot
  // know what to revert to (eg. 'valid' or 'expired') and it might
  // also mess up other higher-level order processes. So we simply
  // skip reverting since there's probably going to be very few
  // cases when a fill is permanently orphaned (eg. 99.99% of the
  // time, the fill will be reincluded in a future block).

  await db.any(`delete from "fill_events" where "block_hash" = $/blockHash/`, {
    blockHash,
  });
};
