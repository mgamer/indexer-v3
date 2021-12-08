import { db } from "@/common/db";

export type GetCollectionsFilter = {
  community?: string;
  collection?: string;
  name?: string;
  sortBy?: "id" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export const getCollections = async (filter: GetCollectionsFilter) => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "c"."description",
      "c"."image",
      "c"."royalty_bps" as "royaltyBps",
      "c"."royalty_recipient" as "royaltyRecipient",
      "cs"."token_count" as "tokenCount",
      "cs"."on_sale_count" as "onSaleCount",
      "cs"."unique_owners_count" as "uniqueOwnersCount",
      "cs"."sample_image" as "sampleImage",
      "cs"."floor_sell_value" as "floorSellValue",
      "cs"."top_buy_value" as "topBuyValue"
    from "collections" "c"
    join "collection_stats" "cs"
      on "c"."id" = "cs"."collection_id"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (filter.name) {
    filter.name = `%${filter.name}%`;
    conditions.push(`"c"."name" ilike $/name/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "id";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "id": {
      baseQuery += ` order by "c"."id" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by "cs"."floor_sell_value" * "cs"."token_count" ${filter.sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      image: r.image,
      royalty: {
        recipient: r.royaltyRecipient,
        bps: r.royaltyBps,
      },
      tokenCount: r.tokenCount,
      onSaleCount: r.onSaleCount,
      uniqueOwnersCount: r.uniqueOwnersCount,
      sampleImage: r.sampleImage,
      floorSellValue: r.floorSellValue,
      topBuyValue: r.topBuyValue,
    }))
  );
};

export type GetCollectionOwnershipsFilter = {
  collection: string;
  owner?: string;
  offset: number;
  limit: number;
};

export const getCollectionOwnerships = async (
  filter: GetCollectionOwnershipsFilter
) => {
  let baseQuery = `
    select
      "o"."owner",
      sum("o"."amount") as "amount",
      max("t"."image") AS "sampleImage",
      count("t"."token_id") filter (where "t"."floor_sell_hash" is not null) as "onSaleCount",
      min("t"."floor_sell_value") as "minFloorSellValue",
      max("t"."floor_sell_value") as "maxFloorSellValue",
      sum("t"."floor_sell_value") as "floorSellValueSum"
    from "ownerships" "o"
    join "tokens" "t"
      on "o"."contract" = "t"."contract"
      and "o"."token_id" = "t"."token_id"
      and "o"."amount" > 0
  `;

  // Filters
  const conditions: string[] = [`"t"."collection_id" = $/collection/`];
  if (filter.owner) {
    conditions.push(`"o"."owner" = $/owner/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "o"."owner"`;

  // Sorting
  baseQuery += ` order by "amount" desc`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};

export type GetUserCollectionsFilter = {
  user: string;
  community?: string;
  collection?: string;
  offset: number;
  limit: number;
};

export const getUserCollections = async (filter: GetUserCollectionsFilter) => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "c"."description",
      "c"."image",
      "cs"."floor_sell_value" as "floorSellValue",
      "cs"."token_count" as "tokenCount",
      "cs"."on_sale_count" as "onSaleCount",
      "cs"."unique_owners_count" as "uniqueOwnersCount",
      "cs"."sample_image" as "sampleImage",
      "us"."owner",
      "us"."owned_token_count" as "ownedTokenCount",
      "us"."owned_token_count" * "cs"."floor_sell_value" as "ownedMarketValue"
    from "collections" "c"
    join "collection_stats" "cs"
      on "c"."id" = "cs"."collection_id"
    join (
      select
        "cc"."id" as "collection_id",
        "o"."owner",
        sum("o"."amount") as "owned_token_count"
      from "collections" "cc"
      join "tokens" "t"
        on "cc"."id" = "t"."collection_id"
      join "ownerships" "o"
        on "t"."contract" = "o"."contract"
        and "t"."token_id" = "o"."token_id"
        and "o"."amount" > 0
      group by "cc"."id", "o"."owner"
    ) "us"
      on "c"."id" = "us"."collection_id"
  `;

  // Filters
  const conditions: string[] = [`"us"."owner" = $/user/`];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  baseQuery += ` order by "us"."owned_token_count" desc nulls last`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
