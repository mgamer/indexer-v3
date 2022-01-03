import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetOrdersFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  maker?: string;
  hash?: string;
  includeInvalid?: boolean;
  side: "sell" | "buy";
  offset: number;
  limit: number;
};

export type GetOrdersResponse = {
  hash: string;
  tokenSetId: string;
  tokenSetLabel: string;
  kind: string;
  side: string;
  maker: string;
  price: number;
  value: number;
  validFrom: number;
  validUntil: number;
  sourceInfo: any;
  royaltyInfo: any;
  rawData: any;
}[];

export const getOrders = async (
  filter: GetOrdersFilter
): Promise<GetOrdersResponse> => {
  // TODO: Have separate queries based on filter options to improve performance

  let baseQuery = `
    select distinct on ("o"."hash")
      "o"."hash",
      "o"."status",
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
  if (filter.contract) {
    conditions.push(`"tst"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"tst"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"ts"."collection_id" = $/collection/`);
  }

  if (!filter.includeInvalid) {
    conditions.push(`"o"."status" = 'valid'`);
    conditions.push(`"o"."valid_between" @> now()`);
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
      status: r.status,
      tokenSetId: r.token_set_id,
      tokenSetLabel: r.token_set_label,
      kind: r.kind,
      side: r.side,
      maker: r.maker,
      price: formatEth(r.price),
      value: formatEth(r.value),
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      sourceInfo: r.source_info,
      royaltyInfo: r.royalty_info,
      rawData: r.raw_data,
    }))
  );
};
