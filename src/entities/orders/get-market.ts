import { formatEth } from "@/common/bignumber";
import { db, pgp } from "@/common/db";

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
  // For safety, we cap the number of results that can get returned
  const limit = 200;

  type RawDepthInfo = {
    value: string;
    quantity: string;
  };

  let buys: RawDepthInfo[] = [];
  let sells: RawDepthInfo[] = [];

  if (filter.contract && filter.tokenId) {
    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          count(distinct("o"."hash")) as "quantity"
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

    sells = await db.manyOrNone(
      `
        select
          "o"."value",
          count(distinct("o"."hash")) as "quantity"
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
  } else if (filter.collection && filter.attributes) {
    let sellsQuery = `
      select
        "o"."value",
        count(distinct("o"."hash")) as "quantity"
      from "tokens" "t"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
      join "attributes" "a"
        on "t"."contract" = "a"."contract"
        and "t"."token_id" = "a"."token_id"
    `;

    const attributes: { key: string; value: string }[] = [];
    Object.entries(filter.attributes).forEach(([key, values]) => {
      (Array.isArray(values) ? values : [values]).forEach((value) =>
        attributes.push({ key, value })
      );
    });

    attributes.forEach(({ key, value }, i) => {
      sellsQuery += `
        join "attributes" "a${i}"
          on "t"."contract" = "a${i}"."contract"
          and "t"."token_id" = "a${i}"."token_id"
          and "a${i}"."key" = $/key${i}/
          and "a${i}"."value" = $/value${i}/
      `;
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });

    sellsQuery += `
      where "t"."collection_id" = $/collection/
      group by "o"."hash", "o"."value"
      order by "o"."value" asc
      limit ${limit}
    `;

    sells = await db.manyOrNone(sellsQuery, filter);

    // TODO: Retrieve matching buy orders once attribute-based get integrated
  } else if (filter.collection) {
    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          count(distinct("o"."hash")) as "quantity"
        from "orders" "o"
        join "token_sets" "ts"
          on "o"."token_set_id" = "ts"."id"
        where "ts"."collection_id" = $/collection/
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
        group by "o"."value"
        order by "o"."value" desc
        limit ${limit}
      `,
      filter
    );

    sells = await db.manyOrNone(
      `
        select
          "o"."value",
          count(distinct("o"."hash")) as "quantity"
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
