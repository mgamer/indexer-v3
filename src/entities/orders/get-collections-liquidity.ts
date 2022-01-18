import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionsLiquidityFilter = {
  collection?: string;
  offset: number;
  limit: number;
};

export type GetCollectionsLiquidityResponse = {
  collection: {
    id: string;
    name: string;
    image: string | null;
  };
  tokenCount: number;
  liquidity: number;
  uniqueTopBuyers: number;
  topLiquidityProvider: string | null;
}[];

export const getCollectionsLiquidity = async (
  filter: GetCollectionsLiquidityFilter
): Promise<GetCollectionsLiquidityResponse> => {
  let baseQuery = `
    select
      "t"."collection_id",
      sum("t"."top_buy_value") as "liquidity",
      count(*) filter (where "t"."top_buy_value" is not null) as "token_count",
      count(distinct("t"."top_buy_maker")) filter (where "t"."top_buy_maker" is not null) as "unique_top_buyers"
    from "tokens" "t"
  `;

  const conditions: string[] = [
    `"t"."collection_id" is not null`,
    `"t"."top_buy_maker" is not null`,
  ];
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "t"."collection_id"`;

  // Sorting
  baseQuery += ` order by sum("t"."top_buy_value") desc nulls last`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  baseQuery = `
    with "x" as (${baseQuery})
    select
      "x".*,
      (
        select
          "c"."name"
        from "collections" "c"
        where "c"."id" = "x"."collection_id"
      ) as "collection_name",
      (
        select
          "c"."image"
        from "collections" "c"
        where "c"."id" = "x"."collection_id"
      ) as "collection_image",
      (
        select
          "t"."top_buy_maker"
        from "tokens" "t"
        where "t"."collection_id" = "x"."collection_id"
        group by "t"."top_buy_maker"
        order by sum("t"."top_buy_value") desc nulls last
        limit 1
      ) as "top_liquidity_provider"
    from "x"
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.collection_id,
        name: r.collection_name,
        image: r.collection_image,
      },
      tokenCount: Number(r.token_count),
      liquidity: formatEth(r.liquidity),
      uniqueTopBuyers: Number(r.unique_top_buyers),
      topLiquidityProvider: r.top_liquidity_provider,
    }))
  );
};
