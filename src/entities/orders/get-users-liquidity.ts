import * as Sdk from "@reservoir0x/sdk";

import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";
import { config } from "@/config/index";

export type GetUsersLiquidityFilter = {
  collection?: string;
  offset: number;
  limit: number;
};

export type GetUsersLiquidityResponse = {
  user: string;
  tokenCount: number;
  liquidity: number;
  wethBalance: number;
}[];

export const getUsersLiquidity = async (
  filter: GetUsersLiquidityFilter
): Promise<GetUsersLiquidityResponse> => {
  let baseQuery = `
    select
      "t"."top_buy_maker" as "user",
      sum("t"."top_buy_value") as "liquidity",
      count(*) as "token_count"
    from "tokens" "t"
  `;

  const conditions: string[] = [`"t"."top_buy_maker" is not null`];
  if (filter.collection) {
    conditions.push(`"t"."collection_id" = $/collection/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "t"."top_buy_maker"`;

  // Sorting
  baseQuery += ` order by sum("t"."top_buy_value") desc nulls last`;

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  baseQuery = `
    with "x" as (${baseQuery})
    select
      "x".*,
      (
        select
          coalesce("o"."amount", 0)
        from "ownerships" "o"
        where "o"."contract" = $/weth/
          and "o"."token_id" = -1
          and "o"."owner" = "x"."user"
          and "o"."amount" > 0
      ) as "weth_balance"
    from "x"
  `;
  (filter as any).weth = Sdk.Common.Addresses.Weth[config.chainId];

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      user: r.user,
      liquidity: formatEth(r.liquidity),
      tokenCount: Number(r.token_count),
      wethBalance: formatEth(r.weth_balance),
    }))
  );
};
