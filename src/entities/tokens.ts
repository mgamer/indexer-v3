import { db } from "@/common/db";

export type GetTokensFilter = {
  collection?: string;
  contract?: string;
  tokenId?: string;
  owner?: string;
  attributes?: { [key: string]: string };
  offset: number;
  limit: number;
};

export const getTokens = async (filter: GetTokensFilter) => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id" as "tokenId",
      "ct"."kind",
      "t"."name",
      "t"."image"
      "cl"."id",
      "cl"."name",
      "t"."floor_sell_hash" as "floorSellHash",
      "t"."floor_sell_value" as "floorSellValue",
      "t"."top_buy_hash" as "topBuyHash",
      "t"."top_buy_value" as "topBuyValue"
    from "tokens" "t"
    join "collections" "cl"
      on "t"."collection_id" = "cl"."id"
    join "contracts" "ct"
      on "t"."contract" = "ct"."address"
  `;

  if (filter.owner) {
    baseQuery += `
      join "ownerships" "o"
        on "t"."contract" = "o"."contract"
        and "t"."token_id" = "o"."token_id"
        and "o"."amount" > 0
    `;
  }

  const conditions: string[] = [];
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.owner) {
    conditions.push(`"o"."owner" = $/owner/`);
  }
  if (filter.attributes) {
    Object.entries(filter.attributes).forEach(([key, value], i) => {
      conditions.push(`
        exists(
          select from "attributes" "a"
          where "a"."contract" = "t"."contract"
            and "a"."token_id" = "t"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `);
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "t"."floor_sell_value" asc nulls last`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};

export type GetTokenStatsFilter = {
  collection?: string;
  contract?: string;
  tokenId?: string;
  attributes?: { [key: string]: string };
  offset: number;
  limit: number;
};

export const getTokenStats = async (filter: GetTokenStatsFilter) => {
  let baseQuery = `
    select
      count(distinct("t"."token_id")) as "count",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "onSaleCount",
      count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "uniqueOwnersCount",
      max("t"."image") as "sampleImage",
      min("t"."floor_sell_value") as "floorSellValue",
      max("t"."top_buy_value") as "topBuyValue",
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  const conditions: string[] = [];
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.attributes) {
    Object.entries(filter.attributes).forEach(([key, value], i) => {
      conditions.push(`
        exists(
          select from "attributes" "a"
          where "a"."contract" = "t"."contract"
            and "a"."token_id" = "t"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `);
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  return db.oneOrNone(baseQuery, filter);
};

export type GetTokenOwnersFilter = {
  collection?: string;
  contract?: string;
  tokenId?: string;
  owner?: string;
  attributes?: { [key: string]: string };
  offset: number;
  limit: number;
};

export const getTokenOwners = async (filter: GetTokenOwnersFilter) => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id" as "tokenId",
      "o"."owner",
      "o"."amount"
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  const conditions: string[] = [];
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.owner) {
    conditions.push(`"o"."owner" = $/owner/`);
  }
  if (filter.attributes) {
    Object.entries(filter.attributes).forEach(([key, value], i) => {
      conditions.push(`
        exists(
          select from "attributes" "a"
          where "a"."contract" = "t"."contract"
            and "a"."token_id" = "t"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `);
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "o"."amount" desc nulls last`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
