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
        join "tokens" "t"
          on "a"."contract" = "t"."contract"
          and "a"."token_id" = "t"."token_id"
          and "a"."rank" is not null
        where "t"."collection_id" = $/collection/
          and ("a"."kind" = 'string' or "a"."kind" = 'number')
        group by "a"."key", "a"."value", "a"."rank"
      ),
      "xx" as (
        select
          "x"."key",
          "x"."kind",
          "x"."rank",
          array_agg(json_build_object('value', "x"."value", 'count', "x"."count")) as "values"
        from "x"
        group by "x"."key", "x"."kind", "x"."rank"
      ),
      "y" as (
        select
          "a"."key",
          min("a"."kind") as "kind",
          min("a"."rank") as "rank",
          min("a"."value"::numeric) as "min_value",
          max("a"."value"::numeric) as "max_value"
        from "attributes" "a"
        join "tokens" "t"
          on "a"."contract" = "t"."contract"
          and "a"."token_id" = "t"."token_id"
          and "a"."rank" is not null
        where "t"."collection_id" = $/collection/
          and ("a"."kind" = 'range' or "a"."kind" = 'date')
        group by "a"."key", "a"."rank"
      ),
      "yy" as (
        select
          "y"."key",
          "y"."kind",
          "y"."rank",
          array[
            json_build_object('value', "y"."min_value"::text, 'count', 0),
            json_build_object('value', "y"."max_value"::text, 'count', 0)
          ] as "values"
        from "y"
        group by "y"."key", "y"."kind", "y"."rank", "y"."min_value", "y"."max_value"
      )
    select * from "xx"
    union all
    select * from "yy"
    order by "rank"
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      kind: r.kind,
      values: r.values,
    }))
  );
};
