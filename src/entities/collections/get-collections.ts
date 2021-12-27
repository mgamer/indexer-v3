import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionsFilter = {
  community?: string;
  collection?: string;
  name?: string;
  sortBy?: "id" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetCollectionsResponse = {
  collection: {
    id: string;
    name: string;
    description: string;
    image: string;
  };
  royalties: {
    recipient: string | null;
    bps: number;
  };
  set: {
    tokenCount: number;
    onSaleCount: number;
    uniqueOwnersCount: number;
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

export const getCollections = async (
  filter: GetCollectionsFilter
): Promise<GetCollectionsResponse> => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "c"."description",
      "c"."image",
      "c"."royalty_bps",
      "c"."royalty_recipient",
      "cs"."token_count",
      "cs"."on_sale_count",
      "cs"."unique_owners_count",
      "cs"."sample_images",
      "cs"."floor_sell_hash",
      "os"."value" as "floor_sell_value",
      "os"."maker" as "floor_sell_maker",
      date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
      "cs"."top_buy_hash",
      "ob"."value" as "top_buy_value",
      "ob"."maker" as "top_buy_maker",
      date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
    from "collections" "c"
    join "collection_stats" "cs"
      on "c"."id" = "cs"."collection_id"
    left join "orders" "os"
      on "cs"."floor_sell_hash" = "os"."hash"
    left join "orders" "ob"
      on "cs"."top_buy_hash" = "ob"."hash"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (filter.name) {
    filter.name = `%${filter.name}%`;
    conditions.push(`"c"."name" ilike $/name/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  filter.sortBy = filter.sortBy ?? "id";
  filter.sortDirection = filter.sortDirection ?? "asc";
  switch (filter.sortBy) {
    case "id": {
      baseQuery += ` order by "c"."id" ${filter.sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by "cs"."floor_sell_value" * "cs"."token_count" ${filter.sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.id,
        name: r.name,
        description: r.description,
        image: r.image,
      },
      royalties: {
        recipient: r.royalty_recipient,
        bps: r.royalty_bps,
      },
      set: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        uniqueOwnersCount: Number(r.unique_owners_count),
        sampleImages: r.sample_images,
        market: {
          floorSell: {
            hash: r.floor_sell_hash,
            value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            maker: r.floor_sell_maker,
            validFrom: r.floor_sell_valid_from,
          },
          topBuy: {
            hash: r.top_buy_hash,
            value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            maker: r.top_buy_maker,
            validFrom: r.top_buy_valid_from,
          },
        },
      },
    }))
  );
};
