import { db } from "@/common/db";

export type GetAttributesFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
};

export type GetAttributesResponse = {
  key: string;
  value: string;
  count: number;
}[];

export const getAttributes = async (
  filter: GetAttributesFilter
): Promise<GetAttributesResponse> => {
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

  // Grouping
  baseQuery += ` group by "a"."key", "a"."value"`;

  // Sorting
  baseQuery += ` order by "count" desc, "a"."key" asc nulls last`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      value: r.value,
      count: Number(r.count),
    }))
  );
};
