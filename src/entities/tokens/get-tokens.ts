import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetTokensFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string | string[] };
  tokenSetId?: string;
  onSale?: boolean;
  sortBy?: "tokenId" | "floorSellValue" | "topBuyValue";
  sortByAttribute?: string;
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetTokensResponse = {
  contract: string;
  tokenId: string;
  name: string | null;
  image: string;
  collection: {
    id: string;
    name: string;
  };
  topBuyValue: number | null;
  floorSellValue: number | null;
}[];

export const getTokens = async (
  filter: GetTokensFilter
): Promise<GetTokensResponse> => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id",
      "t"."name",
      "t"."image",
      "c"."id" as "collection_id",
      "c"."name" as "collection_name",
      "t"."floor_sell_value",
      "t"."top_buy_value"
    from "tokens" "t"
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
  `;

  if (filter.tokenSetId) {
    baseQuery += `
      join "token_sets_tokens" "tst"
        on "t"."contract" = "tst"."contract"
        and "t"."token_id" = "tst"."token_id"
    `;
  }

  if (filter.sortByAttribute) {
    baseQuery += `
      join "attributes" "a"
        on "t"."contract" = "a"."contract"
        and "t"."token_id" = "a"."token_id"
    `;
  }

  if (filter.attributes) {
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
  }

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (filter.tokenSetId) {
    conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
  }
  if (filter.onSale === true) {
    conditions.push(`"t"."floor_sell_hash" is not null`);
  } else if (filter.onSale === false) {
    conditions.push(`"t"."floor_sell_hash" is null`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  const sortBy = filter.sortByAttribute ?? filter.sortBy ?? "floorSellValue";
  const sortDirection = filter.sortDirection ?? "asc";
  switch (sortBy) {
    case "tokenId": {
      baseQuery += ` order by "t"."token_id" ${sortDirection} nulls last`;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by "t"."floor_sell_value" ${sortDirection} nulls last`;
      break;
    }

    case "topBuyValue": {
      baseQuery += ` order by "t"."top_buy_value" ${sortDirection} nulls last`;
      break;
    }

    default: {
      baseQuery += `
        order by
          (
            select "a"."value"
            from "attributes" "a"
            where "a"."contract" = "t"."contract"
              and "a"."token_id" = "t"."token_id"
              and "a"."key" = $/sortByAttribute/
              and "a"."kind" = 'string'
          ) ${sortDirection} nulls last,
          (
            select "a"."value"::numeric
            from "attributes" "a"
            where "a"."contract" = "t"."contract"
              and "a"."token_id" = "t"."token_id"
              and "a"."key" = $/sortByAttribute/
              and "a"."kind" = 'number'
          ) ${sortDirection} nulls last,
          "t"."token_id" asc nulls last
      `;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      contract: r.contract,
      tokenId: r.token_id,
      name: r.name,
      image: r.image,
      collection: {
        id: r.collection_id,
        name: r.collection_name,
      },
      topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
      floorSellValue: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
    }))
  );
};
