import { db } from "@/common/db";

export type GetBestOrderFilter = {
  contract?: string;
  tokenId?: string;
  side: "sell" | "buy";
};

export type GetBestOrderResponse = { tokenSetId: string; rawData: any } | null;

export const getBestOrder = async (
  filter: GetBestOrderFilter
): Promise<GetBestOrderResponse> => {
  const joinColumn =
    filter.side === "sell" ? "floor_sell_hash" : "top_buy_hash";

  const baseQuery = `
      select
        "o"."token_set_id",
        "o"."raw_data"
      from "orders" "o"
      join "tokens" "t"
        on "t"."${joinColumn}" = "o"."hash"
      where "t"."contract" = $/contract/
        and "t"."token_id" = $/tokenId/
    `;

  return db.oneOrNone(baseQuery, filter).then(
    (r) =>
      r && {
        tokenSetId: r.token_set_id,
        rawData: r.raw_data,
      }
  );
};
