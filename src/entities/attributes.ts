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

export type GetCollectionExploreFilter = {
  collection: string;
  attribute?: string;
  onSaleCount?: number;
  sortBy?: "key" | "floorSellValue" | "topBuyValue" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export const getCollectionExplore = async (
  filter: GetCollectionExploreFilter
) => {
  let baseQueryInner = `
    select
      "a"."key",
      "a"."value",
      count(distinct("t"."token_id")) as "tokenCount",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "onSaleCount",
      count(distinct("o"."owner")) filter (where "o"."amount" > 0) as "uniqueOwnersCount",
      (array_agg("t"."image"))[1:4] as "sampleImages",
      min("t"."floor_sell_value") as "floorSellValue",
      max("t"."top_buy_value") as "topBuyValue"
    from "attributes" "a"
    join "tokens" "t"
      on "a"."contract" = "t"."contract"
      and "a"."token_id" = "t"."token_id"
    left join "ownerships" "o"
      on "a"."contract" = "o"."contract"
      and "a"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  // Filters
  const conditionsInner: string[] = [`"t"."collection_id" = $/collection/`];
  if (filter.attribute) {
    conditionsInner.push(`"a"."key" = $/attribute/`);
  }
  if (conditionsInner.length) {
    baseQueryInner +=
      " where " + conditionsInner.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQueryInner += ` group by "a"."key", "a"."value"`;

  let baseQueryOuter = `
    select * from (${baseQueryInner}) "x"
  `;

  // Filters
  const conditionsOuter: string[] = [];
  if (filter.onSaleCount) {
    conditionsOuter.push(`"x"."onSaleCount" >= $/onSaleCount/`);
  }
  if (conditionsOuter.length) {
    baseQueryOuter +=
      " where " + conditionsOuter.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "key";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "key": {
      baseQueryOuter += ` order by "x"."key" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorSellValue": {
      baseQueryOuter += ` order by "x"."floorSellValue" ${filter.sortDirection} nulls last`;
      break;
    }

    case "topBuyValue": {
      baseQueryOuter += ` order by "x"."topBuyValue" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQueryOuter += ` order by "x"."floorSellValue" * "x"."tokenCount" ${filter.sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQueryOuter += ` offset $/offset/`;
  baseQueryOuter += ` limit $/limit/`;

  return db.manyOrNone(baseQueryOuter, filter);
};
