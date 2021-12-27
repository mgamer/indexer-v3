import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetUserLiquidityFilter = {
  user: string;
  offset: number;
  limit: number;
};

export type GetUserLiquidityResponse = {
  collection: {
    id: string;
    name: string;
  };
  buyCount: number;
  topBuy: {
    value: number | null;
    validUntil: number | null;
  };
  sellCount: number;
  floorSell: {
    value: number | null;
    validUntil: number | null;
  };
}[];

export const getUserLiquidity = async (
  filter: GetUserLiquidityFilter
): Promise<GetUserLiquidityResponse> => {
  // TODO: Restructure query to make it more performant

  let baseQuery = `
    select
      "b".*,
      "s".*
    from (
      select
        "x"."collection_id",
        "x"."collection_name",
        "x"."buy_count",
        "y"."top_buy_value",
        "y"."top_buy_valid_until"
      from (
        select
          "t"."collection_id",
          "c"."name" as "collection_name",
          count(distinct("hash")) as "buy_count"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        join "collections" "c"
          on "t"."collection_id" = "c"."id"
        where "o"."maker" = $/user/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        group by "t"."collection_id", "c"."name"
      ) "x"
      join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "o"."value" as "top_buy_value",
          coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "top_buy_valid_until"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        where "o"."maker" = $/user/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        order by "t"."collection_id", "o"."value" desc
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
    ) "b"
    full join (
      select
        "x"."collection_id",
        "x"."collection_name",
        "x"."sell_count",
        "y"."floor_sell_value",
        "y"."floor_sell_valid_until"
      from (
        select
          "t"."collection_id",
          "c"."name" as "collection_name",
          count(distinct("hash")) as "sell_count"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        join "collections" "c"
          on "t"."collection_id" = "c"."id"
        where "o"."maker" = $/user/
          and "o"."side" = 'sell'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        group by "t"."collection_id", "c"."name"
      ) "x"
      join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "o"."value" as "floor_sell_value",
          coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "floor_sell_valid_until"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        join "tokens" "t"
          on "tst"."contract" = "t"."contract"
          and "tst"."token_id" = "t"."token_id"
        where "o"."maker" = $/user/
          and "o"."side" = 'sell'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        order by "t"."collection_id", "o"."value" desc
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
    ) "s"
      on "b"."collection_id" = "s"."collection_id"
  `;

  // Sorting
  baseQuery += ` order by "b"."collection_id"`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.collection_id,
        name: r.collection_name,
      },
      buyCount: Number(r.buy_count),
      topBuy: {
        value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
        validUntil: r.top_buy_valid_until,
      },
      sellCount: Number(r.sell_count),
      floorSell: {
        value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
        validUntil: r.floor_sell_valid_until,
      },
    }))
  );
};
