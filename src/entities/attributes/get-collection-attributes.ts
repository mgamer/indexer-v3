import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionAttributesFilter = {
  collection: string;
  attribute?: string;
  onSaleCount?: number;
  sortBy?: "value" | "floorSellValue" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetCollectionAttributesResponse = {
  key: string;
  value: string;
  tokenCount: number;
  onSaleCount: number;
  sampleImages: string[];
  floorSellValues: number[];
  topBuyValues: number[];
}[];

export const getCollectionAttributes = async (
  filter: GetCollectionAttributesFilter
): Promise<GetCollectionAttributesResponse> => {
  let baseQuery = `
    with "x" as (
      select
        "a"."key",
        "a"."value",
        min("a"."rank") as "rank",
        count(distinct("t"."token_id")) as "token_count",
        count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
        (array_agg(distinct("t"."image")))[1:4] as "sample_images",
        min("t"."floor_sell_value") as "floor_sell_value",
        (array_agg("t"."floor_sell_value" order by "t"."floor_sell_value") filter (where "t"."floor_sell_value" is not null))[1:10]::text[] as "floor_sell_values"
      from "attributes" "a"
      join "tokens" "t"
        on "a"."contract" = "t"."contract"
        and "a"."token_id" = "t"."token_id"
      where "t"."collection_id" = $/collection/
        and "a"."rank" is not null
        and ("a"."kind" = 'string' or "a"."kind" = 'number')
      group by "a"."key", "a"."value"
    )
    select * from "x"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.attribute) {
    conditions.push(`"x"."key" = $/attribute/`);
  }
  if (filter.onSaleCount) {
    conditions.push(`"x"."on_sale_count" >= $/onSaleCount/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "value";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "value": {
      // TODO: Integrate sorting by attribute kind
      baseQuery += `
        order by
          "x"."rank",
          "x"."key",
          "x"."value" ${filter.sortDirection} nulls last
        `;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by "x"."floor_sell_value" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by "x"."floor_sell_value" * "x"."token_count" ${filter.sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      value: r.value,
      tokenCount: Number(r.token_count),
      onSaleCount: Number(r.on_sale_count),
      sampleImages: r.sample_images,
      floorSellValues: r.floor_sell_values
        ? r.floor_sell_values.map((x: any) => x && formatEth(x))
        : [],
      // TODO: Integrate buy orders once attribute-based orders get integrated
      topBuyValues: [],
    }))
  );
};
