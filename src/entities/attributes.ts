import { db } from "@/common/db";

export type GetAttributesFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
};

export const getAttributes = async (filter: GetAttributesFilter) => {
  let baseQuery = `
    select
      "a"."key",
      "a"."value",
      count(*) as "count"
    from "attributes" "a"
    join "tokens" "t"
      on "a"."contract" = "t"."contract"
      and "a"."token_id" = "t"."token_id"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"a"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"a"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "a"."key", "a"."value"`;

  // Sorting
  baseQuery += ` order by "count" desc, "a"."key" asc nulls last`;

  return db.manyOrNone(baseQuery, filter);
};

export type GetCollectionAttributesFilter = {
  collection: string;
  attribute?: string;
  onSaleCount?: number;
  sortBy?: "key" | "floorSellValue" | "topBuyValue" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export const getCollectionAttributes = async (
  filter: GetCollectionAttributesFilter
) => {
  let baseQuery = `
    select
      "x".*,
      "y".*
    from (
      select
        "a"."key",
        "a"."value",
        count(distinct("t"."token_id")) as "token_count",
        count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
        count(distinct("o"."owner")) filter (where "o"."amount" > 0) as "unique_owners_count",
        (array_agg("t"."image"))[1:4] as "sample_images"
      from "attributes" "a"
      join "tokens" "t"
        on "a"."contract" = "t"."contract"
        and "a"."token_id" = "t"."token_id"
      left join "ownerships" "o"
        on "a"."contract" = "o"."contract"
        and "a"."token_id" = "o"."token_id"
        and "o"."amount" > 0
      group by "a"."key", "a"."value"
    ) "x"
    join (
      select distinct on ("a"."key", "a"."value")
        "a"."key",
        "a"."value",
        "t"."floor_sell_hash",
        "t"."floor_sell_value",
        "o"."maker" as "floor_sell_maker",
        date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from"
      from "attributes" "a"
      join "tokens" "t"
        on "a"."contract" = "t"."contract"
        and "a"."token_id" = "t"."token_id"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
      where "t"."collection_id" = $/collection/
      order by "a"."key", "a"."value", "t"."floor_sell_value" asc
    ) "y"
      on "x"."key" = "y"."key"
      and "x"."value" = "y"."value"
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
  filter.sortBy = filter.sortBy ?? "key";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "key": {
      baseQuery += ` order by "x"."key" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by "y"."floor_sell_value" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by "y"."floor_sell_value" * "x"."token_count" ${filter.sortDirection} nulls last`;
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
      set: {
        compositionId: null,
        token_count: r.token_count,
        on_sale_count: r.on_sale_count,
        unique_owners_count: r.unique_owners_count,
        sample_images: r.sample_images,
        market: {
          floorSell: {
            hash: r.floor_sell_hash,
            value: r.floor_sell_value,
            maker: r.floor_sell_maker,
            validFrom: r.floor_sell_valid_from,
          },
          topBuy: {
            hash: null,
            value: null,
            maker: null,
            validFrom: null,
          },
        },
      },
    }))
  );
};
