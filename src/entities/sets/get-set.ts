import { formatEth } from "@/common/bignumber";
import { db, pgp } from "@/common/db";

export type GetSetFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
};

export type GetSetResponse = {
  tokenCount: number;
  onSaleCount: number;
  sampleImages: string[];
  market: {
    floorSell: {
      hash: string | null;
      value: number | null;
      maker: string | null;
      validFrom: number | null;
    };
    topBuy: {
      hash: string | null;
      value: number | null;
      maker: string | null;
      validFrom: number | null;
    };
  };
} | null;

export const getSet = async (filter: GetSetFilter): Promise<GetSetResponse> => {
  let baseQuery: string | undefined;
  if (filter.contract && filter.tokenId) {
    // Handle single token sets
    baseQuery = `
      select
        "x".*,
        "os"."value" as "floor_sell_value",
        "os"."maker" as "floor_sell_maker",
        date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
        "ob"."value" as "top_buy_value",
        "ob"."maker" as "top_buy_maker",
        date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
      from (
        select
          count(distinct("t"."token_id")) as "token_count",
          count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
          (array_agg("t"."image"))[1:1] as "sample_images",
          max("t"."floor_sell_hash") as "floor_sell_hash",
          max("t"."top_buy_hash") as "top_buy_hash"
        from "tokens" "t"
        where "t"."contract" = $/contract/
          and "t"."token_id" = $/tokenId/
        group by "t"."contract", "t"."token_id"
      ) "x"
      left join "orders" "os"
        on "x"."floor_sell_hash" = "os"."hash"
      left join "orders" "ob"
        on "x"."top_buy_hash" = "ob"."hash"
    `;
  } else if (filter.collection && filter.attributes) {
    // Handle token list sets

    const columns = new pgp.helpers.ColumnSet(["key", "value"]);
    const values = pgp.helpers.values(
      Object.entries(filter.attributes).map(([key, value]) => ({ key, value })),
      columns
    );

    baseQuery = `
      select
        "x".*,
        "y"."floor_sell_hash",
        "y"."floor_sell_value",
        "y"."floor_sell_maker",
        "y"."floor_sell_valid_from"
      from (
        select
          "a"."key",
          "a"."value",
          count(distinct("t"."token_id")) as "token_count",
          count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
          (array_agg("t"."image"))[1:4] as "sample_images"
        from "tokens" "t"
        join "attributes" "a"
          on "t"."contract" = "a"."contract"
          and "t"."token_id" = "a"."token_id"
        where "t"."collection_id" = $/collection/
          and ("a"."key", "a"."value") in (${values})
        group by "a"."key", "a"."value"
      ) "x"
      left join (
        select distinct on ("t"."floor_sell_value", "a"."key", "a"."value")
          "a"."key",
          "a"."value",
          "t"."floor_sell_hash",
          "o"."value" as "floor_sell_value",
          "o"."maker" as "floor_sell_maker",
          date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from"
        from "tokens" "t"
        join "attributes" "a"
          on "t"."contract" = "a"."contract"
          and "t"."token_id" = "a"."token_id"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        where "t"."collection_id" = $/collection/
          and ("a"."key", "a"."value") in (${values})
        order by "t"."floor_sell_value" asc
        limit 1
      ) "y"
        on "x"."key" = "y"."key"
        and "x"."value" = "y"."value"
    `;
  } else if (filter.collection) {
    // Handle collection sets
    baseQuery = `
      select
        "cs".*,
        "os"."maker" as "floor_sell_maker",
        date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
        "ob"."maker" as "top_buy_maker",
        date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
      from "collection_stats" "cs"
      left join "orders" "os"
        on "cs"."floor_sell_hash" = "os"."hash"
      left join "orders" "ob"
        on "cs"."top_buy_hash" = "ob"."hash"
      where "cs"."collection_id" = $/collection/
    `;
  }

  if (baseQuery) {
    return db.oneOrNone(baseQuery, filter).then((r) => ({
      tokenCount: Number(r.token_count),
      onSaleCount: Number(r.on_sale_count),
      sampleImages: r.sample_images,
      market: {
        floorSell: {
          hash: r.floor_sell_hash,
          value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
          maker: r.floor_sell_maker,
          validFrom: r.floor_sell_valid_from,
        },
        // TODO: Once attribute-based orders are live, these fields
        // will need to be queried and populated in the response
        topBuy: {
          hash: r.top_buy_hash,
          value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          maker: r.top_buy_maker,
          validFrom: r.top_buy_valid_from,
        },
      },
    }));
  }

  return null;
};
