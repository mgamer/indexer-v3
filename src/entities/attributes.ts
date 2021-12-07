import { db } from "@/common/db";

export type GetAttributesFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  offset: number;
  limit: number;
};

export const getAttributes = async (filter: GetAttributesFilter) => {
  let baseQuery = `
    select
      "a"."key",
      "a"."value",
      count(*) as "count"
    from "attributes" "a"
    join "tokens" "t"
      on "a"."contract" = "t"."contract"
      and "a"."token_id" = "t"."token_id"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"a"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"a"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` group by "a"."key", "a"."value"`;

  // Sorting
  baseQuery += ` order by "count" desc nulls last`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
