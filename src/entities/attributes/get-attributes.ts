import { db } from "@/common/db";

export type GetAttributesFilter = {
  collection: string;
};

export type GetAttributesResponse = {
  key: string;
  kind: string;
  values: {
    value: string;
    count: number;
  }[];
}[];

export const getAttributes = async (
  filter: GetAttributesFilter
): Promise<GetAttributesResponse> => {
  // TODO: Once we refactor the attributes, there are a few things
  // we need to properly handle in here:
  // - for `date` and `range` kinds return the min and max values
  // - return the attributes ordered by rank

  const baseQuery = `
    select
      "x"."key",
      array_agg(json_build_object('value', "x"."value", 'count', "x"."count")) as "values"
    from (
      select
        "a"."key",
        "a"."value",
        min("a"."rank") as "rank",
        count(*) as "count"
      from "attributes" "a"
      where "a"."collection_id" = $/collection/
        and "a"."rank" is not null
        and ("a"."kind" = 'number' or "a"."kind" = 'string')
      group by "a"."key", "a"."value"
    ) "x"
    group by "x"."rank", "x"."key"
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      kind: r.kind,
      values: r.values,
    }))
  );
};
