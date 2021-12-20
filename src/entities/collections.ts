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

export const getCollections = async (filter: GetCollectionsFilter) => {
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
        compositionId: null,
        tokenCount: r.token_count,
        onSaleCount: r.on_sale_count,
        uniqueOwnersCount: r.unique_wwners_count,
        sampleImages: r.sample_images,
        market: {
          floorSell: {
            hash: r.floor_sell_hash,
            value: r.floor_sell_value,
            maker: r.floor_sell_maker,
            validFrom: r.floor_sell_valid_from,
          },
          topBuy: {
            hash: r.top_buy_hash,
            value: r.top_buy_value,
            maker: r.top_buy_maker,
            validFrom: r.top_buy_valid_from,
          },
        },
      },
    }))
  );
};

export type GetUserCollectionsFilter = {
  user: string;
  community?: string;
  collection?: string;
  offset: number;
  limit: number;
};

export const getUserCollections = async (filter: GetUserCollectionsFilter) => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "o"."owner",
      sum("o"."amount") as "token_count",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
      min("t"."floor_sell_value") as "floor_sell_value",
      max("t"."top_buy_value") as "top_buy_value",
      sum("o"."amount") * max("t"."top_buy_value") as "total_buy_value",
      max(coalesce("b"."timestamp", extract(epoch from now())::int)) as "last_acquired_at"
    from "ownerships" "o"
    join "tokens" "t"
      on "o"."contract" = "t"."contract"
      and "o"."token_id" = "t"."token_id"
      and "o"."amount" > 0
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
    join "nft_transfer_events" "nte"
      on "t"."contract" = "nte"."address"
      and "t"."token_id" = "nte"."token_id"
    left join "blocks" "b"
      on "nte"."block" = "b"."block"
  `;

  // Filters
  const conditions: string[] = [`"o"."owner" = $/user/`];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "c"."id", "o"."owner"`;

  // Sorting
  baseQuery += ` order by "token_count" desc, "o"."owner"`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.id,
        name: r.name,
      },
      ownership: {
        tokenCount: r.token_count,
        onSaleCount: r.on_sale_count,
        floorSellValue: r.floor_sell_value,
        topBuyValue: r.top_buy_value,
        totalBuyValue: r.total_buy_value,
        lastAcquiredAt: r.last_acquired_at,
      },
    }))
  );
};
