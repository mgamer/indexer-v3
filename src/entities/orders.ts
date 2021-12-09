import { db } from "@/common/db";

export type GetOrdersFilter = {
  contract?: string;
  tokenId?: string;
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
      "ts"."collection_id" as "collectionId"
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
      "ts"."collection_id" as "collectionId",
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
