import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionTopBuysFilter = {
  collection: string;
  attributes?: { [key: string]: string | string[] };
};

export type GetCollectionTopBuysResponse = {
  value: number;
  quantity: number;
}[];

export const getCollectionTopBuys = async (
  filter: GetCollectionTopBuysFilter
): Promise<GetCollectionTopBuysResponse> => {
  let baseQuery = `
    select
      "t"."top_buy_value" as "value",
      count(*) as "quantity"
    from "tokens" "t"
  `;

  const conditions: string[] = [
    `"t"."collection_id" = $/collection/`,
    `"t"."top_buy_value" is not null`,
  ];
  if (filter.attributes && Object.keys(filter.attributes).length === 1) {
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
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "t"."top_buy_value"`;

  // Sorting
  baseQuery += ` order by "t"."top_buy_value" desc nulls last`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      value: formatEth(r.value),
      quantity: Number(r.quantity),
    }))
  );
};
