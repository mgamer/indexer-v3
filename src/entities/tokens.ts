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
      "t"."token_id",
      "ct"."kind",
      "t"."name",
      "t"."image",
      "cl"."id" as "collection_id",
      "cl"."name" as "collection_name",
      "t"."floor_sell_hash",
      "os"."value" as "floor_sell_value",
      "os"."maker" as "floor_sell_maker",
      date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
      "t"."top_buy_hash",
      "ob"."value" as "top_buy_value",
      "ob"."maker" as "top_buy_maker",
      date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
    from "tokens" "t"
    join "collections" "cl"
      on "t"."collection_id" = "cl"."id"
    join "contracts" "ct"
      on "t"."contract" = "ct"."address"
    left join "orders" "os"
      on "t"."floor_sell_hash" = "os"."hash"
    left join "orders" "ob"
      on "t"."top_buy_hash" = "ob"."hash"
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

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      token: {
        contract: r.contract,
        tokenId: r.tokenId,
        kind: r.kind,
        image: r.image,
        collection: {
          id: r.collection_id,
          name: r.collection_name,
        },
      },
      market: {
        floorSell: {
          hash: r.floor_sell_hash,
          value: r.floor_sell_value,
          maker: r.floor_sell_maker,
          validFrom: r.floor_sell_valid_from,
        },
        topBuy: {
          hash: r.top_buy_hash,
          value: r.top_buy_value,
          maker: r.top_buy_maker,
          validFrom: r.top_buy_valid_from,
        },
      },
    }))
  );
};

export type GetTokensStatsFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
  onSale?: boolean;
};

export const getTokensStats = async (filter: GetTokensStatsFilter) => {
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
  hasOffer?: string;
  offset: number;
  limit: number;
};

export const getUserTokens = async (filter: GetUserTokensFilter) => {
  let baseQuery = `
    select distinct on ("nte"."block")
      "t"."contract",
      "t"."token_id",
      "t"."image",
      "c"."id" as "collection_id",
      "c"."name" as "collection_name",
      "o"."amount" as "token_count",
      (case when "t"."floor_sell_hash" is not null
        then 1
        else 0
      end)::numeric(78, 0) as "on_sale_count",
      "t"."floor_sell_value",
      "t"."top_buy_value",
      "o"."amount" * "t"."top_buy_value" as "total_buy_value",
      coalesce("b"."timestamp", extract(epoch from now())::int) as "last_acquired_at"
    from "tokens" "t"
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
    left join "orders" "os"
      on "t"."floor_sell_hash" = "os"."hash"
    left join "orders" "ob"
      on "t"."top_buy_hash" = "ob"."hash"
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
  if (filter.hasOffer) {
    conditions.push(`"t"."top_buy_hash" is not null`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  baseQuery += ` order by "nte"."block" desc`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      token: {
        contract: r.contract,
        tokenId: r.token_id,
        image: r.image,
        collection: {
          id: r.collection_id,
          name: r.collection_name,
        },
      },
      ownership: {
        tokenCount: r.token_count,
        onSaleCount: r.on_sale_count,
        floorSellValue: r.floor_sell_value,
        topBuyValue: r.top_buy_value,
        totalBuyValue: r.total_buy_value,
        lastAcquiredAt: r.last_acquired_at,
      },
    }))
  );
};
