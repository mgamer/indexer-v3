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
      "o"."raw_data" as "rawData"
    from "orders" "o"
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

  baseQuery += ` group by "o"."hash"`;

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
