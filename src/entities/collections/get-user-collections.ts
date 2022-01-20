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
    image: string;
    floorSellValue: number | null;
    topBuyValue: number | null;
  };
  ownership: {
    tokenCount: number;
    onSaleCount: number;
    liquidCount: number;
    lastAcquiredAt: number | null;
  };
}[];

export const getUserCollections = async (
  filter: GetUserCollectionsFilter
): Promise<GetUserCollectionsResponse> => {
  let baseQuery = `
    select
      "c"."id" as "collection_id",
      sum("o"."amount") as "token_count",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
      count(distinct("t"."token_id")) filter (where "t"."top_buy_value" is not null) as "liquid_count",
      sum("t"."top_buy_value") as "total_buy_value"
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
  `;

  // Filters
  const conditions: string[] = [`"o"."owner" = $/user/`, `"o"."amount" > 0`];
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
  baseQuery += ` order by sum("o"."amount") desc, "o"."owner"`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  baseQuery = `
    with "x" as (${baseQuery})
    select
      "x".*,
      "c"."name",
      "c"."image",
      (
        select
          min("t"."floor_sell_value")
        from "tokens" "t"
        where "t"."collection_id" = "x"."collection_id"
      ) as "collection_floor_sell_value",
      (
        select
          "ts"."top_buy_value"
        from "token_sets" "ts"
        where "ts"."collection_id" = "x"."collection_id"
          and "ts"."attribute_key" is null
          and "ts"."attribute_value" is null
        limit 1
      ) as "collection_top_buy_value",
      (
        select
          coalesce("b"."timestamp", extract(epoch from now())::int)
        from "nft_transfer_events" "nte"
        join "tokens" "t"
          on "nte"."address" = "t"."contract"
          and "nte"."token_id" = "t"."token_id"
        join "ownerships" "o"
          on "nte"."address" = "o"."contract"
          and "nte"."token_id" = "o"."token_id"
        left join "blocks" "b"
          on "nte"."block" = "b"."block"
        where "t"."collection_id" = "x"."collection_id"
          and "o"."owner" = $/user/
          and "o"."amount" > 0
        order by "nte"."block" desc
        limit 1
      ) as "last_acquired_at"
    from "x"
    join "collections" "c"
      on "x"."collection_id" = "c"."id"
    order by "x"."token_count" desc
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.id,
        name: r.name,
        image: r.image,
        floorSellValue: r.collection_floor_sell_value
          ? formatEth(r.collection_floor_sell_value)
          : null,
        topBuyValue: r.collection_top_buy_value
          ? formatEth(r.collection_top_buy_value)
          : null,
      },
      ownership: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        liquidCount: Number(r.liquid_count),
        lastAcquiredAt: r.last_acquired_at,
      },
    }))
  );
};
