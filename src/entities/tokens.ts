import { db } from "@/common/db";

export type GetTokensFilter = {
  contract?: string;
  tokenId?: string;
  owner?: string;
  offset: number;
  limit: number;
};

export const getTokens = async (filter: GetTokensFilter) => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id" as "tokenId",
      "c"."kind",
      "t"."floor_sell_hash" as "floorSellHash",
      "t"."floor_sell_value" as "floorSellValue",
      "t"."top_buy_hash" as "topBuyHash",
      "t"."top_buy_value" as "topBuyValue"
    from "tokens" "t"
    join "contracts" "c"
      on "t"."contract" = "c"."address"
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
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.owner) {
    conditions.push(`"o"."owner" = $/owner/`);
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
  contract?: string;
  offset: number;
  limit: number;
};

export const getTokenStats = async (filter: GetTokenStatsFilter) => {
  let baseQuery = `
    select
      count("t"."token_id") as "count",
      min("t"."floor_sell_value") as "floorSellValue",
      max("t"."top_buy_value") as "topBuyValue",
      count("t"."token_id") filter (where "t"."floor_sell_value" is not null) as "onSaleCount",
      count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "uniqueOwnersCount"
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  return db.oneOrNone(baseQuery, filter);
};

export type GetTokenOwnersFilter = {
  contract?: string;
  tokenId?: string;
  owner?: string;
  offset: number;
  limit: number;
};

export const getTokenOwners = async (filter: GetTokenOwnersFilter) => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id" as "tokenId",
      "o"."amount"
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.owner) {
    conditions.push(`"o"."owner" = $/owner/`);
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "t"."contract", "t"."token_id"`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
