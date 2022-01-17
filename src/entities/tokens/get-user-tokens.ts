import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetUserTokensFilter = {
  user: string;
  community?: string;
  collection?: string;
  hasOffer?: string;
  sortBy?: "acquiredAt" | "topBuyValue";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetUserTokensResponse = {
  token: {
    contract: string;
    tokenId: string;
    name: string | null;
    image: string;
    collection: {
      id: string;
      name: string;
    };
  };
  ownership: {
    tokenCount: number;
    onSaleCount: number;
    floorSellValue: number | null;
    topBuyValue: number | null;
    totalBuyValue: number | null;
    lastAcquiredAt: number | null;
  };
  topBuy: {
    hash: string | null;
    value: number | null;
    schema: any | string;
  };
}[];

export const getUserTokens = async (
  filter: GetUserTokensFilter
): Promise<GetUserTokensResponse> => {
  let baseQuery = `
    select distinct on ("t"."contract", "t"."token_id")
      "t"."contract",
      "t"."token_id",
      "t"."name",
      "t"."image",
      "c"."id" as "collection_id",
      "c"."name" as "collection_name",
      "o"."amount" as "token_count",
      (case when "t"."floor_sell_hash" is not null
        then 1
        else 0
      end)::numeric(78, 0) as "on_sale_count",
      "t"."floor_sell_value",
      "t"."top_buy_hash",
      "ts"."label" as "top_buy_schema",
      "t"."top_buy_value",
      "o"."amount" * "t"."top_buy_value" as "total_buy_value",
      "b"."block",
      coalesce("b"."timestamp", extract(epoch from now())::int) as "last_acquired_at"
    from "tokens" "t"
    join "collections" "c"
      on "t"."collection_id" = "c"."id"
    join "ownerships" "o"
      on "t"."contract" = "o"."contract"
      and "t"."token_id" = "o"."token_id"
      and "o"."amount" > 0
    left join "orders" "os"
      on "t"."floor_sell_hash" = "os"."hash"
    left join "orders" "ob"
      on "t"."top_buy_hash" = "ob"."hash"
    left join "token_sets" "ts"
      on "ob"."token_set_id" = "ts"."id"
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
  if (filter.hasOffer) {
    conditions.push(`"t"."top_buy_hash" is not null`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery = `
    select
      "x"."contract",
      "x"."token_id",
      "x"."name",
      "x"."image",
      "x"."collection_id",
      "x"."collection_name",
      "x"."token_count",
      "x"."on_sale_count",
      "x"."floor_sell_value",
      "x"."top_buy_hash",
      "x"."top_buy_value",
      "x"."top_buy_schema",
      "x"."total_buy_value",
      "x"."last_acquired_at"
    from (${baseQuery}) "x"
  `;

  // Sorting
  const sortBy = filter.sortBy ?? "acquiredAt";
  const sortDirection = filter.sortDirection ?? "desc";
  switch (sortBy) {
    case "acquiredAt": {
      baseQuery += `
        order by
          "x"."block" ${sortDirection} nulls last,
          "x"."contract",
          "x"."token_id"
      `;
      break;
    }

    case "topBuyValue": {
      baseQuery += `
        order by
          "x"."top_buy_value" ${sortDirection} nulls last,
          "x"."contract",
          "x"."token_id"
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
        name: r.name,
        image: r.image,
        collection: {
          id: r.collection_id,
          name: r.collection_name,
        },
      },
      ownership: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        floorSellValue: r.floor_sell_value
          ? formatEth(r.floor_sell_value)
          : null,
        topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
        totalBuyValue: r.total_buy_value ? formatEth(r.total_buy_value) : null,
        lastAcquiredAt: r.last_acquired_at,
      },
      topBuy: {
        hash: r.top_buy_hash,
        value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
        schema: r.top_buy_schema,
      },
    }))
  );
};
