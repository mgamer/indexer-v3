import { db } from "@/common/db";

export type GetOrdersFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  maker?: string;
  hash?: string;
  side: "sell" | "buy";
  offset: number;
  limit: number;
};

export const getOrders = async (filter: GetOrdersFilter) => {
  let baseQueryInner = `
    select
      "o"."hash",
      "o"."token_set_id" as "tokenSetId",
      "o"."kind",
      "o"."side",
      "o"."maker",
      "o"."price",
      "o"."value",
      date_part('epoch', lower("o"."valid_between")) as "validFrom",
      coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "validUntil",
      "o"."source_info" as "sourceInfo",
      "o"."royalty_info" as "royaltyInfo",
      "o"."raw_data" as "rawData"
    from "orders" "o"
    join "token_sets_tokens" "tst"
      on "o"."token_set_id" = "tst"."token_set_id"
  `;

  // Filters
  const conditionsInner: string[] = [
    `"o"."status" = 'valid'`,
    `"o"."valid_between" @> now()`,
  ];
  if (filter.contract) {
    conditionsInner.push(`"tst"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditionsInner.push(`"tst"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditionsInner.push(`"tst"."token_set_id" = $/collection/`);
  }
  if (filter.maker) {
    conditionsInner.push(`"o"."maker" = $/maker/`);
  }
  if (filter.hash) {
    conditionsInner.push(`"o"."hash" = $/hash/`);
  }
  if (filter.side === "buy") {
    conditionsInner.push(`"o"."side" = 'buy'`);
  } else if (filter.side === "sell") {
    conditionsInner.push(`"o"."side" = 'sell'`);
  }
  if (conditionsInner.length) {
    baseQueryInner +=
      " where " + conditionsInner.map((c) => `(${c})`).join(" and ");
  }

  baseQueryInner += ` group by "o"."hash"`;

  // Sorting
  if (filter.side === "buy") {
    baseQueryInner += ` order by "o"."value" desc`;
  } else if (filter.side === "sell") {
    baseQueryInner += ` order by "o"."value" asc`;
  }

  let baseQueryOuter = `
    select
      "x".*,
      "ts"."contract",
      "ts"."token_id" as "tokenId",
      "ts"."collection_id" as "collection"
    from (${baseQueryInner}) "x"
    join "token_sets" "ts"
      on "ts"."id" = "x"."tokenSetId"
  `;

  // Pagination
  baseQueryOuter += ` offset $/offset/`;
  baseQueryOuter += ` limit $/limit/`;

  return db.manyOrNone(baseQueryOuter, filter);
};

export type GetFillFilter = {
  contract?: string;
  tokenId?: string;
  side?: "buy" | "sell";
  offset: number;
  limit: number;
};

export const getFill = async (filter: GetFillFilter) => {
  let baseQuery = `
    select
      "o"."hash",
      "o"."kind",
      "o"."side",
      "o"."maker",
      "o"."price",
      "o"."value",
      "ts"."id" as "tokenSetId",
      "ts"."contract",
      "ts"."token_id" as "tokenId",
      "ts"."collection_id" as "collection",
      date_part('epoch', lower("o"."valid_between")) as "validFrom",
      coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "validUntil",
      "o"."source_info" as "sourceInfo",
      "o"."royalty_info" as "royaltyInfo",
      "o"."raw_data" as "rawData"
    from "tokens" "t"
  `;

  // Conditional joins
  filter.side = filter.side ?? "sell";
  if (filter.side === "buy") {
    baseQuery += `
      join "orders" "o"
        on "t"."top_buy_hash" = "o"."hash"
      join "token_sets" "ts"
        on "o"."token_set_id" = "ts"."id"
    `;
  } else if (filter.side === "sell") {
    baseQuery += `
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
      join "token_sets" "ts"
        on "o"."token_set_id" = "ts"."id"
    `;
  }

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  return db.oneOrNone(baseQuery, filter);
};

export type GetUserLiquidityFilter = {
  user: string;
  offset: number;
  limit: number;
};

export const getUserLiquidity = async (filter: GetUserLiquidityFilter) => {
  // TODO: Restructure query

  let baseQuery = `
    select
      "b".*,
      "s".*
    from (
      select
        "x"."collection_id",
        "x"."collection_name",
        "x"."buy_count",
        "y"."top_buy_value",
        "y"."top_buy_valid_until"
      from (
        select
          "t"."collection_id",
          "c"."name" as "collection_name",
          count(distinct("hash")) as "buy_count"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        join "collections" "c"
          on "t"."collection_id" = "c"."id"
        where "o"."maker" = $/user/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        group by "t"."collection_id", "c"."name"
      ) "x"
      join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "o"."value" as "top_buy_value",
          coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "top_buy_valid_until"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        where "o"."maker" = $/user/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        order by "t"."collection_id", "o"."value" desc
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
    ) "b"
    full join (
      select
        "x"."collection_id",
        "x"."collection_name",
        "x"."sell_count",
        "y"."floor_sell_value",
        "y"."floor_sell_valid_until"
      from (
        select
          "t"."collection_id",
          "c"."name" as "collection_name",
          count(distinct("hash")) as "sell_count"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        join "collections" "c"
          on "t"."collection_id" = "c"."id"
        where "o"."maker" = $/user/
          and "o"."side" = 'sell'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        group by "t"."collection_id", "c"."name"
      ) "x"
      join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "o"."value" as "floor_sell_value",
          coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "floor_sell_valid_until"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        where "o"."maker" = $/user/
          and "o"."side" = 'sell'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        order by "t"."collection_id", "o"."value" desc
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
    ) "s"
      on "b"."collection_id" = "s"."collection_id"
  `;

  // Sorting
  baseQuery += ` order by "b"."collection_id"`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.collection_id,
        name: r.collection_name,
      },
      buyCount: r.buy_count,
      topBuy: {
        value: r.top_buy_value,
        validUntil: r.top_buy_valid_until,
      },
      sellCount: r.sell_count,
      floorSell: {
        value: r.floor_sell_value,
        validUntil: r.floor_sell_valid_until,
      },
    }))
  );
};
