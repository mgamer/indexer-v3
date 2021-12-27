import { db, pgp } from "@/common/db";

export type GetMarketFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
};

type DepthInfo = {
  value: string;
  quantity: string;
};

export type GetMarketResponse = {
  buys: DepthInfo[];
  sells: DepthInfo[];
};

export const getMarket = async (
  filter: GetMarketFilter
): Promise<GetMarketResponse> => {
  // For safety, we cap the number of results that can get returned
  const limit = 100;

  let buys: DepthInfo[] = [];
  let sells: DepthInfo[] = [];

  if (filter.contract && filter.tokenId) {
    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          count("o"."hash") as "quantity"
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
      {
        contract: filter.contract,
        tokenId: filter.tokenId,
      }
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
        order by "o"."value" desc
        limit ${limit}
      `,
      {
        contract: filter.contract,
        tokenId: filter.tokenId,
      }
    );
  } else if (filter.collection && filter.attributes) {
    // TODO: Add support for `buys` once attribute-based get supported

    const columns = new pgp.helpers.ColumnSet(["key", "value"]);
    const values = pgp.helpers.values(
      Object.entries(filter.attributes).map(([key, value]) => ({ key, value })),
      columns
    );

    sells = await db.manyOrNone(
      `
        select
          "o"."value",
          count(distinct("o"."hash")) as "quantity"
        from "tokens" "t"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        join "attributes" "a"
          on "t"."contract" = "a"."contract"
          and "t"."token_id" = "a"."token_id"
        where "t"."collection_id" = $/collection/
          and ("a"."key", "a"."value") in (${values})
        group by "o"."hash", "o"."value"
        order by "o"."value" desc
        limit ${limit}
      `,
      {
        collection: filter.collection,
      }
    );
  } else if (filter.collection) {
    buys = await db.manyOrNone(
      `
        select
          "o"."value",
          count("o"."hash") as "quantity"
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
      {
        collection: filter.collection,
      }
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
        group by "o"."hash", "o"."value"
        order by "o"."value" desc
        limit ${limit}
      `,
      {
        collection: filter.collection,
      }
    );
  }

  return { buys, sells };
};
