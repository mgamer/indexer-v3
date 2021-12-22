import { db } from "@/common/db";

export type GetOrdersFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  maker?: string;
  hash?: string;
  includeAll?: boolean;
  side: "sell" | "buy";
  offset: number;
  limit: number;
};

export const getOrders = async (filter: GetOrdersFilter) => {
  // TODO: Refactor so that `contract`, `token_id` and `collection_id`
  // from the `token_sets` table are not used at all (so that we can
  // easily remove them)

  let baseQuery = `
    select distinct on ("o"."hash")
      "o"."hash",
      "o"."token_set_id",
      "ts"."label" as "token_set_label",
      "o"."kind",
      "o"."side",
      "o"."maker",
      "o"."price",
      "o"."value",
      date_part('epoch', lower("o"."valid_between")) as "valid_from",
      coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "valid_until",
      "o"."source_info",
      "o"."royalty_info",
      "o"."raw_data"
    from "orders" "o"
    join "token_sets" "ts"
      on "o"."token_set_id" = "ts"."id"
    join "token_sets_tokens" "tst"
      on "o"."token_set_id" = "tst"."token_set_id"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.contract && filter.tokenId) {
    if (filter.includeAll) {
      // Include all orders that include the specific token
      conditions.push(`"tst"."contract" = $/contract/`);
      conditions.push(`"tst"."token_id" = $/tokenId/`);
    } else {
      // By default only fetch exactly-matching orders
      conditions.push(`"ts"."contract" = $/contract/`);
      conditions.push(`"ts"."token_id" = $/tokenId/`);
    }
  } else if (filter.collection) {
    // Fetch collection-wide orders only
    conditions.push(`"ts"."collection_id" = $/collection/`);
  } else {
    return [];
  }
  conditions.push(`"o"."status" = 'valid'`);
  conditions.push(`"o"."valid_between" @> now()`);
  if (filter.maker) {
    conditions.push(`"o"."maker" = $/maker/`);
  }
  if (filter.hash) {
    conditions.push(`"o"."hash" = $/hash/`);
  }
  if (filter.side === "buy") {
    conditions.push(`"o"."side" = 'buy'`);
  } else if (filter.side === "sell") {
    conditions.push(`"o"."side" = 'sell'`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  if (filter.side === "buy") {
    baseQuery += ` order by "o"."hash", "o"."value" desc`;
  } else if (filter.side === "sell") {
    baseQuery += ` order by "o"."hash", "o"."value" asc`;
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      hash: r.hash,
      tokenSetId: r.token_set_id,
      tokenSetLabel: r.token_set_label,
      kind: r.kind,
      side: r.side,
      maker: r.maker,
      price: r.price,
      value: r.value,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      sourceInfo: r.source_info,
      royaltyInfo: r.royalty_info,
      rawData: r.raw_data,
    }))
  );
};

export type GetBestOrderFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  side: "sell" | "buy";
};

export const getBestOrder = async (filter: GetBestOrderFilter) => {
  if (filter.contract && filter.tokenId) {
    const joinColumn =
      filter.side === "sell" ? "floor_sell_hash" : "top_buy_hash";

    const baseQuery = `
      select
        "o"."raw_data"
      from "orders" "o"
      join "tokens" "t"
        on "t"."${joinColumn}" = "o"."hash"
      where "t"."contract" = $/contract/
        and "t"."token_id" = $/tokenId/
    `;

    return db.oneOrNone(baseQuery, filter);
  } else if (filter.collection) {
    const joinColumn =
      filter.side === "sell" ? "floor_sell_hash" : "top_buy_hash";

    const baseQuery = `
      select
        "o"."raw_data"
      from "orders" "o"
      join "collection_stats" "cs"
        on "cs"."${joinColumn}" = "o"."hash"
      where "cs"."collection_id" = $/collection/
    `;

    return db.oneOrNone(baseQuery, filter);
  }

  // If no match, return nothing
  return undefined;
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
