import { idb } from "@/common/db";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class SalesDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE (created_at, tx_hash, log_index, batch_index) > ($/createdAt/, $/txHash/, $/logIndex/, $/batchIndex/)`;
    }

    const query = `
        SELECT
          contract,
          token_id,
          order_side,
          maker,
          taker,
          amount,
          fill_source,
          tx_hash,
          timestamp,
          price,
          block,
          log_index,
          batch_index
          created_at
        FROM fill_events_2
        ${continuationFilter}
        ORDER BY created_at, tx_hash, log_index, batch_index
        LIMIT $/limit/;  
      `;

    const result = await idb.manyOrNone(query, {
      createdAt: cursor?.createdAt,
      txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
      logIndex: cursor?.logIndex,
      batchIndex: cursor?.batchIndex,
      limit,
    });

    if (result.length) {
      const data = result.map((r) => ({
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        order_side: r.order_side === "sell" ? "ask" : "bid",
        from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
        to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
        price: r.price ? formatEth(r.price) : null,
        amount: String(r.amount),
        fill_source: r.fill_source ? String(r.fill_source) : null,
        tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
        log_index: r.log_index,
        batch_index: r.batch_index,
        timestamp: r.timestamp,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
      }));

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          createdAt: lastResult.created_at,
          txHash: fromBuffer(lastResult.tx_hash),
          logIndex: lastResult.log_index,
          batchIndex: lastResult.batch_index,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  createdAt: string;
  txHash: string;
  logIndex: number;
  batchIndex: string;
};
