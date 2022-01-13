import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetMarketFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string | string[] };
};

export type GetMarketResponse = {
  buys: {
    value: number;
    quantity: number;
  }[];
  sells: {
    value: number;
    quantity: number;
  }[];
};

export const getMarket = async (
  filter: GetMarketFilter
): Promise<GetMarketResponse> => {
  // For safety, cap the number of results that can get returned
  const limit = 200;

  type RawDepthInfo = {
    value: string;
    quantity: string;
  };

  let buys: RawDepthInfo[] = [];
  let sells: RawDepthInfo[] = [];

  if (filter.contract && filter.tokenId) {
    sells = await db.manyOrNone(
      `
        select
          "o"."value",
          sum(count(distinct("o"."hash"))) over (rows between unbounded preceding and current row) as "quantity"
        from "tokens" "t"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        where "t"."contract" = $/contract/
          and "t"."token_id" = $/tokenId/
        group by "o"."value"
        order by "o"."value" asc
        limit ${limit}
      `,
      filter
    );

    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          sum(count(distinct("o"."hash"))) over (rows between unbounded preceding and current row) as "quantity"
        from "orders" "o"
        join "token_sets_tokens" "tst"
          on "o"."token_set_id" = "tst"."token_set_id"
        where "tst"."contract" = $/contract/
          and "tst"."token_id" = $/tokenId/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
        group by "o"."value"
        order by "o"."value" desc
        limit ${limit}
      `,
      filter
    );
  } else if (filter.collection && filter.attributes) {
    let sellsQuery = `
      select
        "o"."value",
        count(distinct("o"."hash")) as "quantity"
      from "tokens" "t"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
    `;

    const sellsConditions: string[] = [`"t"."collection_id" = $/collection/`];
    Object.entries(filter.attributes).forEach(([key, value], i) => {
      sellsConditions.push(`
        exists(
          select from "attributes" "a"
          where "a"."contract" = "t"."contract"
            and "a"."token_id" = "t"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `);
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });

    if (sellsConditions.length) {
      sellsQuery +=
        " where " + sellsConditions.map((c) => `(${c})`).join(" and ");
    }

    sellsQuery += `
      group by "o"."value"
      order by "o"."value" asc
      limit ${limit}
    `;

    sellsQuery = `
      with "x" as (${sellsQuery})
      select
        "x"."value",
        sum("x"."quantity") over (rows between unbounded preceding and current row) as "quantity"
      from "x"
    `;

    sells = await db.manyOrNone(sellsQuery, filter);

    if (Object.entries(filter.attributes).length === 1) {
      const [attributeKey, attributeValue] = Object.entries(
        filter.attributes
      )[0];
      (filter as any).attributeKey = attributeKey;
      (filter as any).attributeValue = attributeValue;

      buys = await db.manyOrNone(
        `
          select
            "o"."value",
            sum(count(distinct("o"."hash"))) over (rows between unbounded preceding and current row) as "quantity"
          from "orders" "o"
          join "token_sets" "ts"
            on "o"."token_set_id" = "ts"."id"
          where "ts"."collection_id" = $/collection/
            and "ts"."attribute_key" = $/attributeKey/
            and "ts"."attribute_value" = $/attributeValue/
            and "o"."side" = 'buy'
            and "o"."status" = 'valid'
          group by "o"."value"
          order by "o"."value" desc
          limit ${limit}
        `,
        filter
      );
    } else {
      // TODO: Support multiple attributes once integrated
      buys = [];
    }
  } else if (filter.collection && !filter.attributes) {
    sells = await db.manyOrNone(
      `
        select
          "o"."value",
          sum(count(distinct("o"."hash"))) over (rows between unbounded preceding and current row) as "quantity"
        from "tokens" "t"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        where "t"."collection_id" = $/collection/
        group by "o"."value"
        order by "o"."value" asc
        limit ${limit}
      `,
      filter
    );

    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          sum(count(distinct("o"."hash"))) over (rows between unbounded preceding and current row) as "quantity"
        from "orders" "o"
        join "token_sets" "ts"
          on "o"."token_set_id" = "ts"."id"
        where "ts"."collection_id" = $/collection/
          and "ts"."attribute_key" is null
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
        group by "o"."value"
        order by "o"."value" desc
        limit ${limit}
      `,
      filter
    );
  }

  return {
    buys: buys.map(({ value, quantity }) => ({
      value: formatEth(value),
      quantity: Number(quantity),
    })),
    sells: sells.map(({ value, quantity }) => ({
      value: formatEth(value),
      quantity: Number(quantity),
    })),
  };
};
