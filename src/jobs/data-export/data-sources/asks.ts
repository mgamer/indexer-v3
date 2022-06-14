import { idb } from "@/common/db";
import { Sources } from "@/models/sources";
import { bn, formatEth, fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class AsksDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE (updated_at, id) > ($/updatedAt/, $/id/)`;
    }

    const query = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.dynamic,
          orders.quantity_filled,
          orders.quantity_remaining,
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
          orders.raw_data,
          orders.created_at,
          orders.updated_at
        FROM orders
        WHERE orders.side = 'sell'
        ${continuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;
      `;

    const result = await idb.manyOrNone(query, {
      id: cursor?.id,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => {
        const [, , tokenId] = r.token_set_id.split(":");

        let startPrice = r.price;
        let endPrice = r.price;

        if (r.dynamic) {
          startPrice = r.raw_data.basePrice;
          endPrice = bn(r.raw_data.basePrice).sub(r.raw_data.extra);
        }

        return {
          id: r.id,
          kind: r.kind,
          status: r.status,
          contract: fromBuffer(r.contract),
          token_id: tokenId,
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          price: formatEth(r.price),
          start_price: formatEth(startPrice),
          end_price: formatEth(endPrice),
          dynamic: r.dynamic,
          quantity: Number(r.quantity_filled) + Number(r.quantity_remaining),
          quantity_filled: Number(r.quantity_filled),
          quantity_remaining: Number(r.quantity_remaining),
          valid_from: Number(r.valid_from),
          valid_until: Number(r.valid_until),
          source: r.source_id ? sources.getByAddress(fromBuffer(r.source_id))?.name : null,
          fee_bps: Number(r.fee_bps),
          fee_breakdown: r.fee_breakdown,
          expiration: Number(r.expiration),
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_at).toISOString(),
        };
      });

      return {
        data,
        nextCursor: {
          id: result[result.length - 1].id,
          updatedAt: result[result.length - 1].updated_at,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  id: number;
  updatedAt: string;
};
