import * as Sdk from "@reservoir0x/sdk";

import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";
import { config } from "@/config/index";

export type GetUsersLiquidityFilter = {
  collection?: string;
  user?: string;
  offset: number;
  limit: number;
};

export type GetUsersLiquidityResponse = {
  user: string;
  rank: number;
  tokenCount: number;
  liquidity: number;
  maxTopBuyValue: number;
  wethBalance: number | null;
}[];

export const getUsersLiquidity = async (
  filter: GetUsersLiquidityFilter
): Promise<GetUsersLiquidityResponse> => {
  let baseQuery = `
    select
      "t"."top_buy_maker" as "user",
      sum("t"."top_buy_value") as "liquidity",
      max("t"."top_buy_value") as "max_top_buy_value",
      rank() over (order by sum("t"."top_buy_value") desc nulls last),
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
  baseQuery += ` order by "rank"`;

  if (!filter.user) {
    // Pagination
    baseQuery += ` offset $/offset/`;
    baseQuery += ` limit $/limit/`;
  }

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

  if (filter.user) {
    baseQuery += ` where "x"."user" = $/user/`;
  }

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      user: r.user,
      rank: Number(r.rank),
      liquidity: formatEth(r.liquidity),
      maxTopBuyValue: formatEth(r.max_top_buy_value),
      tokenCount: Number(r.token_count),
      wethBalance: r.weth_balance ? formatEth(r.weth_balance) : null,
    }))
  );
};
