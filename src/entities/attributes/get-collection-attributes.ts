import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionAttributesFilter = {
  collection: string;
  attribute?: string;
  onSaleCount?: number;
  sortBy?: "key" | "floorSellValue" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetCollectionAttributesResponse = {
  key: string;
  value: string;
  set: {
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
  };
}[];

export const getCollectionAttributes = async (
  filter: GetCollectionAttributesFilter
): Promise<GetCollectionAttributesResponse> => {
  let baseQuery = `
    with "x" as (
      select
        "a"."key",
        "a"."value",
        count(distinct("t"."token_id")) as "token_count",
        count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
        (array_agg("t"."image"))[1:4] as "sample_images",
        min("t"."floor_sell_value") as "floor_sell_value"
      from "attributes" "a"
      join "tokens" "t"
        on "a"."contract" = "t"."contract"
        and "a"."token_id" = "t"."token_id"
      where "t"."collection_id" = $/collection/
        and "a"."rank" is not null
      group by "a"."key", "a"."value"
    )
    select * from "x"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.attribute) {
    conditions.push(`"x"."key" = $/attribute/`);
  }
  if (filter.onSaleCount) {
    conditions.push(`"x"."on_sale_count" >= $/onSaleCount/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "key";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "key": {
      baseQuery += ` order by "x"."key" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by "x"."floor_sell_value" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by "x"."floor_sell_value" * "x"."token_count" ${filter.sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      value: r.value,
      set: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        sampleImages: r.sample_images,
        market: {
          // TODO: Find an efficient way to return all of these
          // fields from the query, not only the value
          floorSell: {
            hash: null,
            value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            maker: null,
            validFrom: null,
          },
          // TODO: Once attribute-based orders are live, these fields
          // will need to be queried and populated in the response
          topBuy: {
            hash: null,
            value: null,
            maker: null,
            validFrom: null,
          },
        },
      },
    }))
  );
};
