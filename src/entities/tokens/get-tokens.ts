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
  token: {
    contract: string;
    tokenId: string;
    kind: string;
    name: string | null;
    image: string;
    collection: {
      id: string;
      name: string;
    };
  };
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
}[];

export const getTokens = async (
  filter: GetTokensFilter
): Promise<GetTokensResponse> => {
  let baseQuery = `
    select
      "t"."contract",
      "t"."token_id",
      "ct"."kind",
      "t"."name",
      "t"."image",
      "cl"."id" as "collection_id",
      "cl"."name" as "collection_name",
      "t"."floor_sell_hash",
      "os"."value" as "floor_sell_value",
      "os"."maker" as "floor_sell_maker",
      date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
      "t"."top_buy_hash",
      "ob"."value" as "top_buy_value",
      "ob"."maker" as "top_buy_maker",
      date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
    from "tokens" "t"
    join "collections" "cl"
      on "t"."collection_id" = "cl"."id"
    join "contracts" "ct"
      on "t"."contract" = "ct"."address"
    left join "orders" "os"
      on "t"."floor_sell_hash" = "os"."hash"
    left join "orders" "ob"
      on "t"."top_buy_hash" = "ob"."hash"
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

    // For performance reasons, only allow up to 5 attributes
    attributes.slice(0, 5).forEach(({ key, value }, i) => {
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
    conditions.push(`"t"."floor_sell_value" is not null`);
  } else if (filter.onSale === false) {
    conditions.push(`"t"."floor_sell_value" is null`);
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
      token: {
        contract: r.contract,
        tokenId: r.token_id,
        kind: r.kind,
        name: r.name,
        image: r.image,
        collection: {
          id: r.collection_id,
          name: r.collection_name,
        },
      },
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
    }))
  );
};
