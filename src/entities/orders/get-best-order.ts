import { db } from "@/common/db";

export type GetBestOrderFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  side: "sell" | "buy";
};

export type GetBestOrderResponse = { rawData: any } | null;

export const getBestOrder = async (
  filter: GetBestOrderFilter
): Promise<GetBestOrderResponse> => {
  let baseQuery: string | undefined;
  if (filter.contract && filter.tokenId) {
    const joinColumn =
      filter.side === "sell" ? "floor_sell_hash" : "top_buy_hash";

    baseQuery = `
      select
        "o"."raw_data"
      from "orders" "o"
      join "tokens" "t"
        on "t"."${joinColumn}" = "o"."hash"
      where "t"."contract" = $/contract/
        and "t"."token_id" = $/tokenId/
    `;
  } else if (filter.collection) {
    const joinColumn =
      filter.side === "sell" ? "floor_sell_hash" : "top_buy_hash";

    baseQuery = `
      select
        "o"."raw_data"
      from "orders" "o"
      join "collection_stats" "cs"
        on "cs"."${joinColumn}" = "o"."hash"
      where "cs"."collection_id" = $/collection/
    `;
  }

  // If no match, return nothing
  if (!baseQuery) {
    return null;
  }

  return db.oneOrNone(baseQuery, filter).then((r) => {
    if (r) {
      return {
        rawData: r.raw_data,
      };
    }

    return null;
  });
};
