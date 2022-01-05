import { db } from "@/common/db";

export type GetAttributesFilter = {
  collection: string;
};

export type GetAttributesResponse = {
  key: string;
  values: {
    value: string;
    count: number;
  }[];
}[];

export const getAttributes = async (
  filter: GetAttributesFilter
): Promise<GetAttributesResponse> => {
  let baseQuery = `
    with "x" as (
      select
        "a"."key",
        "a"."value",
        count(*) as "count"
      from "attributes" "a"
      join "tokens" "t"
        on "a"."contract" = "t"."contract"
        and "a"."token_id" = "t"."token_id"
        and "a"."rank" is not null
      where "t"."collection_id" = $/collection/
      group by "a"."key", "a"."value"
      order by "count" desc, "a"."key" asc nulls last
    )
    select
      "x"."key",
      array_agg(json_build_object('value', "x"."value", 'count', "x"."count")) as "values"
    from "x"
    group by "x"."key"
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      values: r.values,
    }))
  );
};
