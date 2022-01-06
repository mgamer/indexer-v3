import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetStatsFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
};

export type GetStatsResponse = {
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

export const getStats = async (
  filter: GetStatsFilter
): Promise<GetStatsResponse> => {
  let baseQuery: string | undefined;
  if (filter.contract && filter.tokenId) {
    baseQuery = `
      select
        1 as "token_count",
        (case when "t"."floor_sell_hash" is not null
          then 1
          else 0
        end) as "on_sale_count",
        "t"."image",
        "t"."floor_sell_hash",
        "os"."value" as "floor_sell_value",
        "os"."maker" as "floor_sell_maker",
        date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
        "t"."top_buy_hash",
        "ob"."value" as "top_buy_value",
        "ob"."maker" as "top_buy_maker",
        date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
      from "tokens" "t"
      left join "orders" "os"
        on "t"."floor_sell_hash" = "os"."hash"
      left join "orders" "ob"
        on "t"."top_buy_hash" = "ob"."hash"
      where "t"."contract" = $/contract/
        and "t"."token_id" = $/tokenId/
    `;
  } else if (filter.collection && filter.attributes) {
    baseQuery = `
      select
        "t"."contract",
        "t"."token_id",
        "t"."image",
        "t"."floor_sell_hash",
        "t"."floor_sell_value"
      from "tokens" "t"
    `;

    const attributes: { key: string; value: string }[] = [];
    Object.entries(filter.attributes).forEach(([key, values]) => {
      (Array.isArray(values) ? values : [values]).forEach((value) =>
        attributes.push({ key, value })
      );
    });

    attributes.forEach(({ key, value }, i) => {
      baseQuery += `
        join "attributes" "a${i}"
          on "t"."contract" = "a${i}"."contract"
          and "t"."token_id" = "a${i}"."token_id"
          and "a${i}"."key" = $/key${i}/
          and "a${i}"."value" = $/value${i}/
      `;
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });

    baseQuery += ` where "t"."collection_id" = $/collection/`;

    baseQuery = `
      with
        "x" as (${baseQuery}),
        "y" as (
          select distinct on ("x"."floor_sell_value")
            "o"."hash" as "floor_sell_hash",
            "o"."value" as "floor_sell_value",
            "o"."maker" as "floor_sell_maker",
            date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from"
          from "x"
          left join "orders" "o"
            on "x"."floor_sell_hash" = "o"."hash"
          order by "x"."floor_sell_value" asc nulls last
          limit 1
        )
      select
        count(distinct("x"."token_id")) as "token_count",
        count(distinct("x"."token_id")) filter (where "x"."floor_sell_hash" is not null) as "on_sale_count",
        (array_agg(distinct("x"."image")))[1:4] as "sample_images",
        (select "y"."floor_sell_hash" from "y"),
        (select "y"."floor_sell_value" from "y"),
        (select "y"."floor_sell_maker" from "y"),
        (select "y"."floor_sell_valid_from" from "y")
      from "x"
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
    return db.oneOrNone(baseQuery, filter).then(
      (r) =>
        r && {
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
              hash: r.top_buy_hash || null,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              maker: r.top_buy_maker || null,
              validFrom: r.top_buy_valid_from || null,
            },
          },
        }
    );
  }

  return null;
};
