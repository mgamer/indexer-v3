import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetUserCollectionsFilter = {
  user: string;
  community?: string;
  collection?: string;
  offset: number;
  limit: number;
};

export type GetUserCollectionsResponse = {
  collection: {
    id: string;
    name: string;
  };
  ownership: {
    tokenCount: number;
    onSaleCount: number;
    floorSellValue: number | null;
    topBuyValue: number | null;
    totalBuyValue: number | null;
    lastAcquiredAt: number | null;
  };
}[];

export const getUserCollections = async (
  filter: GetUserCollectionsFilter
): Promise<GetUserCollectionsResponse> => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "o"."owner",
      sum("o"."amount") as "token_count",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
      min("t"."floor_sell_value") as "floor_sell_value",
      max("t"."top_buy_value") as "top_buy_value",
      sum("o"."amount") * max("t"."top_buy_value") as "total_buy_value",
      max(coalesce("b"."timestamp", extract(epoch from now())::int)) as "last_acquired_at"
    from "ownerships" "o"
    join "tokens" "t"
      on "o"."contract" = "t"."contract"
      and "o"."token_id" = "t"."token_id"
      and "o"."amount" > 0
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
    join "nft_transfer_events" "nte"
      on "t"."contract" = "nte"."address"
      and "t"."token_id" = "nte"."token_id"
    left join "blocks" "b"
      on "nte"."block" = "b"."block"
  `;

  // Filters
  const conditions: string[] = [`"o"."owner" = $/user/`];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "c"."id", "o"."owner"`;

  // Sorting
  baseQuery += ` order by "token_count" desc, "o"."owner"`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.id,
        name: r.name,
      },
      ownership: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        floorSellValue: r.floor_sell_value
          ? formatEth(r.floor_sell_value)
          : null,
        topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
        totalBuyValue: r.total_buy_value ? formatEth(r.total_buy_value) : null,
        lastAcquiredAt: r.last_acquired_at,
      },
    }))
  );
};
