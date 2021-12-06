import { db } from "@/common/db";

export type GetCollectionsFilter = {
  collection?: string;
  community?: string;
  name?: string;
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
      "c"."royalty_bps" as "royaltyBps",
      "c"."royalty_recipient" as "royaltyRecipient",
      "cs"."token_count" as "tokenCount",
      "cs"."on_sale_count" as "onSaleCount",
      "cs"."unique_owners_count" as "uniqueOwnersCount",
      "cs"."sample_image" as "sampleImage",
      "cs"."floor_sell_value" as "floorSellValue",
      "cs"."top_buy_value" as "topBuyValue"
    from "collections" "c"
    join "collection_stats" "cs"
      on "c"."id" = "cs"."collection_id"
  `;

  const conditions: string[] = [];
  if (filter.collection) {
    conditions.push(`"c"."id" = $/collection/`);
  }
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.name) {
    conditions.push(`"c"."name" ilike $/name/`);
    filter.name = `%${filter.name}%`;
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "c"."id" asc nulls last`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
