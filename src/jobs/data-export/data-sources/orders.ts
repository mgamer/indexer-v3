import { idb } from "@/common/db";
import { Sources } from "@/models/sources";
import { formatEth, fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class OrdersDataSource extends BaseDataSource {
  public async getData(cursor: string | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND updated_at > $/cursor/`;
    }

    const query = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.token_set_schema_hash,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.value,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id,
          orders.fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          extract(epoch from orders.created_at) AS created_at,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          orders.updated_at
        FROM orders
        WHERE side IS NOT NULL
        ${continuationFilter}
        ORDER BY updated_at 
        LIMIT $/limit/;
      `;

    const result = await idb.manyOrNone(query, {
      cursor,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => ({
        id: r.id,
        kind: r.kind,
        side: r.side,
        status: r.status,
        token_set_id: r.token_set_id,
        // token_set_schema_hash: fromBuffer(r.token_set_schema_hash),
        contract: fromBuffer(r.contract),
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        price: formatEth(r.price),
        value:
          r.side === "buy"
            ? formatEth(r.value)
            : formatEth(r.value) - (formatEth(r.value) * Number(r.fee_bps)) / 10000,
        valid_from: Number(r.valid_from),
        valid_until: Number(r.valid_until),
        source: r.source_id ? sources.getByAddress(fromBuffer(r.source_id))?.name : null,
        fee_bps: Number(r.fee_bps),
        fee_breakdown: r.fee_breakdown,
        expiration: Number(r.expiration),
        created_at: new Date(r.created_at * 1000).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
        // rawData: r.raw_data ?? undefined,
        // metadata: r.metadata ?? undefined,
      }));

      return {
        data,
        nextCursor: data[data.length - 1].updated_at,
      };
    }

    return { data: [], nextCursor: null };
  }
}
