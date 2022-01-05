import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetTokensFloorFilter = {
  collection: string;
};

export type GetTokensFloorResponse = { [tokenId: string]: number };

export const getTokensFloor = async (
  filter: GetTokensFloorFilter
): Promise<GetTokensFloorResponse> => {
  let baseQuery = `
    select
      "t"."token_id",
      "t"."floor_sell_value"
    from "tokens" "t"
    where "t"."collection_id" = $/collection/
      and "t"."floor_sell_value" is not null
  `;

  return db
    .manyOrNone(baseQuery, filter)
    .then((result) =>
      Object.fromEntries(
        result.map((r) => [r.token_id, formatEth(r.floor_sell_value)])
      )
    );
};
