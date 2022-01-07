import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetUserPositionsFilter = {
  user: string;
  side: "buy" | "sell";
  status: "valid" | "invalid";
  offset: number;
  limit: number;
};

export type GetUserPositionsResponse = {
  set: {
    id: string;
    schema: any;
    image: string | null;
    floorSellValue: number | null;
    topBuyValue: number | null;
  };
  primaryOrder: {
    value: number | null;
    expiry: number | null;
    status: string | null;
  };
  totalValid: number | null;
}[];

export const getUserPositions = async (
  filter: GetUserPositionsFilter
): Promise<GetUserPositionsResponse> => {
  // TODO: Refactor

  let baseQuery = "";
  if (filter.side === "sell" && filter.status === "valid") {
    baseQuery = `
      select distinct on ("o"."token_set_id")
        "o"."token_set_id",
        "o"."value",
        "o"."status",
        "o"."expiry",
        count(*) over (partition by "o"."token_set_id") as "total_valid"
      from "orders" "o"
      where "o"."status" = 'valid'
        and "o"."side" = 'sell'
        and "o"."maker" = $/user/
      order by "o"."token_set_id", "o"."value"
    `;
  } else if (filter.side === "sell" && filter.status === "invalid") {
    baseQuery = `
      select distinct on ("o"."token_set_id")
        "o"."token_set_id",
        "o"."value",
        "o"."status",
        "o"."expiry",
        0 as "total_valid"
      from "orders" "o"
      where "o"."status" != 'valid'
        and "o"."side" = 'sell'
        and "o"."maker" = $/user/
      order by "o"."token_set_id", "o"."expiry" desc
    `;
  } else if (filter.side === "buy" && filter.status === "valid") {
    baseQuery = `
      select distinct on ("o"."token_set_id")
        "o"."token_set_id",
        "o"."value",
        "o"."status",
        "o"."expiry",
        count(*) over (partition by "o"."token_set_id") as "total_valid"
      from "orders" "o"
      where "o"."status" = 'valid'
        and "o"."side" = 'buy'
        and "o"."maker" = $/user/
      order by "o"."token_set_id", "o"."value" desc
    `;
  } else if (filter.side === "buy" && filter.status === "invalid") {
    baseQuery = `
      select distinct on ("o"."token_set_id")
        "o"."token_set_id",
        "o"."value",
        "o"."status",
        "o"."expiry",
        0 as "total_valid"
      from "orders" "o"
      where "o"."status" != 'valid'
        and "o"."side" = 'buy'
        and "o"."maker" = $/user/
      order by "o"."token_set_id", "o"."expiry" desc
    `;
  }

  baseQuery = `
    with "x" as (${baseQuery})
    select
      "x"."token_set_id",
      "x"."value",
      "x"."status",
      coalesce(nullif(date_part('epoch', "x"."expiry"), 'Infinity'), 0) as "expiry",
      "x"."total_valid",
      "ts"."label" as "schema",
      "t"."image" as "token_image",
      "c"."image" as "collection_image",
      (
        select
          min("o"."value") as "floor_sell_value"
        from "orders" "o"
        where "o"."token_set_id" = "x"."token_set_id"
          and "o"."side" = 'sell'
          and "o"."status" = 'valid'
      ),
      (
        select
          max("o"."value") as "top_buy_value"
        from "orders" "o"
        where "o"."token_set_id" = "x"."token_set_id"
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
      )
    from "x"
    join "token_sets" "ts"
      on "x"."token_set_id" = "ts"."id"
    left join "tokens" "t"
      on "ts"."contract" = "t"."contract"
      and "ts"."token_id" = "t"."token_id"
    left join "collections" "c"
      on "ts"."collection_id" = "c"."id"
    order by "x"."token_set_id"
  `;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      set: {
        id: r.token_set_id,
        schema: r.schema,
        image: r.token_image || r.collection_image || null,
        floorSellValue: r.floor_sell_value
          ? formatEth(r.floor_sell_value)
          : null,
        topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
      },
      primaryOrder: {
        value: r.value ? formatEth(r.value) : null,
        expiry: r.expiry,
        status: r.status,
      },
      totalValid: r.total_valid,
    }))
  );
};
