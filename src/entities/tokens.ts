import { db } from "@/common/db";

export type GetTokensFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
  onSale?: boolean;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
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
      "t"."image",
      "cl"."id" as "collection",
      "cl"."name" as "collectionName",
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

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
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
  if (filter.onSale === true) {
    conditions.push(`"t"."floor_sell_value" is not null`);
  } else if (filter.onSale === false) {
    conditions.push(`"t"."floor_sell_value" is null`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "tokenId";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "tokenId": {
      baseQuery += ` order by "t"."token_id" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by "t"."floor_sell_value" ${filter.sortDirection} nulls last`;
      break;
    }

    case "topBuyValue": {
      baseQuery += ` order by "t"."top_buy_value" ${filter.sortDirection} nulls last`;
      break;
    }

    default: {
      baseQuery += `
        order by
          (
            select "a"."value"
            from "attributes" "a"
            where "a"."contract" = "t"."contract"
              and "a"."token_id" = "t"."token_id"
              and "a"."key" = $/sortBy/
              and "a"."kind" = 'string'
          ) ${filter.sortDirection} nulls last,
          (
            select "a"."value"::numeric
            from "attributes" "a"
            where "a"."contract" = "t"."contract"
              and "a"."token_id" = "t"."token_id"
              and "a"."key" = $/sortBy/
              and "a"."kind" = 'number'
          ) ${filter.sortDirection} nulls last,
          "t"."token_id" asc nulls last
      `;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};

export type GetTokenStatsFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
  onSale?: boolean;
};

export const getTokenStats = async (filter: GetTokenStatsFilter) => {
  let baseQuery = `
    select
      count(distinct("t"."token_id")) as "tokenCount",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "onSaleCount",
      count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "uniqueOwnersCount",
      max("t"."image") as "sampleImage",
      min("t"."floor_sell_value") as "floorSellValue",
      max("t"."top_buy_value") as "topBuyValue"
    from "tokens" "t"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
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
  if (filter.onSale === true) {
    conditions.push(`"t"."floor_sell_value" is not null`);
  } else if (filter.onSale === false) {
    conditions.push(`"t"."floor_sell_value" is null`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  return db.oneOrNone(baseQuery, filter);
};

export type GetUserTokensFilter = {
  user: string;
  community?: string;
  collection?: string;
  offset: number;
  limit: number;
};

export const getUserTokens = async (filter: GetUserTokensFilter) => {
  let baseQuery = `
    select
      "ow"."contract",
      "ow"."token_id" as "tokenId",
      "ow"."owner",
      "ow"."amount",
      (
        select
          coalesce("b"."timestamp", extract(epoch from now())::int)
        from "nft_transfer_events" "nte"
        left join "blocks" "b"
          on "nte"."block" = "b"."block"
        where "nte"."address" = "ow"."contract"
          and "nte"."token_id" = "ow"."token_id"
          and "nte"."to" = "ow"."owner"
        order by "nte"."block" desc
        limit 1
      ) as "acquiredAt",
      (
        select min("or"."value")
        from "orders" "or"
        join "token_sets_tokens" "tst"
          on "or"."token_set_id" = "tst"."token_set_id"
        where "tst"."contract" = "ow"."contract"
          and "tst"."token_id" = "ow"."token_id"
          and "or"."maker" = "ow"."owner"
          and "or"."side" = 'sell'
          and "or"."status" = 'valid'
          and "or"."valid_between" @> now()
      ) as "minFloorSellValue"
    from "ownerships" "ow"
    join "tokens" "t"
      on "ow"."contract" = "t"."contract"
      and "ow"."token_id" = "t"."token_id"
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
  `;

  // Filters
  const conditions: string[] = [`"ow"."owner" = $/user/`];
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
  baseQuery += ` group by "ow"."contract", "ow"."token_id", "ow"."owner"`;

  // Sorting
  baseQuery += ` order by "acquiredAt" desc nulls last`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
