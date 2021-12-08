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
  let baseQuery = `
    select
      "o"."hash",
      "o"."kind",
      "o"."side",
      "o"."maker",
      "o"."price",
      "o"."value",
      "ts"."tag",
      date_part('epoch', lower("o"."valid_between")) as "validFrom",
      coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "validUntil",
      "o"."source_info" as "sourceInfo",
      "o"."royalty_info" as "royaltyInfo",
      "o"."raw_data" as "rawData"
    from "orders" "o"
    join "token_sets" "ts"
      on "o"."token_set_id" = "ts"."id"
    join "token_sets_tokens" "tst"
      on "o"."token_set_id" = "tst"."token_set_id"
  `;

  // Filters
  const conditions: string[] = [
    `"o"."status" = 'valid'`,
    `"o"."valid_between" @> now()`,
  ];
  if (filter.contract) {
    conditions.push(`"tst"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"tst"."token_id" = $/tokenId/`);
  }
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

  baseQuery += ` group by "o"."hash", "ts"."tag"`;

  // Sorting
  if (filter.side === "buy") {
    baseQuery += ` order by "o"."value" desc`;
  } else if (filter.side === "sell") {
    baseQuery += ` order by "o"."value" asc`;
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
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
      "ts"."tag",
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
