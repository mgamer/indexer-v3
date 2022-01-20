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
  // TODO: Implement sorting by rank

  let baseQuery = `
    with
      "x" as (
        select
          "a"."key",
          "a"."value",
          min("a"."kind") as "kind",
          min("a"."rank") as "rank",
          count(*) as "count"
        from "attributes" "a"
        where "a"."collection_id" = $/collection/
          and "a"."rank" is not null
          and ("a"."kind" = 'string' or "a"."kind" = 'number')
        group by "a"."key", "a"."value"
      ),
      "xx" as (
        select
          "x"."key",
          "x"."kind",
          array_agg(json_build_object('value', "x"."value", 'count', "x"."count")) as "values"
        from "x"
        group by "x"."key", "x"."kind"
      ),
      "y" as (
        select
          "a"."key",
          min("a"."kind") as "kind",
          min("a"."rank") as "rank",
          min("a"."value"::numeric) as "min_value",
          max("a"."value"::numeric) as "max_value"
        from "attributes" "a"
        where "a"."collection_id" = $/collection/
          and "a"."rank" is not null
          and ("a"."kind" = 'range' or "a"."kind" = 'date')
        group by "a"."key"
      ),
      "yy" as (
        select
          "y"."key",
          "y"."kind",
          array[
            json_build_object('value', "y"."min_value"::text, 'count', 0),
            json_build_object('value', "y"."max_value"::text, 'count', 0)
          ] as "values"
        from "y"
        group by "y"."key", "y"."kind", "y"."min_value", "y"."max_value"
      )
    select * from "xx"
    union all
    select * from "yy"
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      kind: r.kind,
      values: r.values,
    }))
  );
};
