import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionFilter = {
  collection: string;
};

export type GetCollectionResponse = {
  collection: {
    id: string;
    name: string;
    description: string;
    image: string;
    lastBuy: {
      value: number | null;
      timestamp: number | null;
    };
    lastSell: {
      value: number | null;
      timestamp: number | null;
    };
  };
  royalties: {
    recipient: string | null;
    bps: number;
  };
  set: {
    tokenCount: number;
    onSaleCount: number;
    sampleImages: string[];
    market: {
      floorSell: {
        hash: string | null;
        value: number | null;
        maker: string | null;
        validFrom: number | null;
        validUntil: number | null;
        token: {
          contract: string | null;
          tokenId: number | null;
          name: string | null;
          image: string | null;
        } | null;
      };
      topBuy: {
        hash: string | null;
        value: number | null;
        maker: string | null;
        validFrom: number | null;
        validUntil: number | null;
      };
    };
  };
};

export const getCollection = async (
  filter: GetCollectionFilter
): Promise<GetCollectionResponse> => {
  // TODO: Implement last buy information directly on collections

  let baseQuery = `
    select
      "x".*,
      "u"."last_sell_value",
      "u"."last_sell_timestamp",
      "v"."last_buy_value",
      "v"."last_buy_timestamp",
      "y"."floor_sell_hash",
      "y"."floor_sell_value",
      "y"."floor_sell_maker",
      "y"."floor_sell_valid_from",
      "y"."floor_sell_valid_until",
      "y"."floor_sell_token_contract",
      "y"."floor_sell_token_id",
      "y"."floor_sell_token_name",
      "y"."floor_sell_token_image",
      "z"."top_buy_hash",
      "z"."top_buy_value",
      "z"."top_buy_maker",
      "z"."top_buy_valid_from",
      "z"."top_buy_valid_until"
    from (
      select
        "c"."id",
        "c"."name",
        "c"."description",
        "c"."image",
        "c"."royalty_bps",
        "c"."royalty_recipient",
        count("t"."token_id") as "token_count",
        count("t"."token_id") filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
        (array_agg(distinct("t"."image")))[1:4] as "sample_images"
      from "collections" "c"
      join "tokens" "t"
        on "c"."id" = "t"."collection_id"
      where "c"."id" = $/collection/
      group by "c"."id"
    ) "x"
    left join (
      select distinct on ("t"."collection_id")
        "t"."collection_id",
        "t"."contract" as "floor_sell_token_contract",
        "t"."token_id" as "floor_sell_token_id",
        "t"."name" as "floor_sell_token_name",
        "t"."image" as "floor_sell_token_image",
        "t"."floor_sell_hash",
        "o"."value" as "floor_sell_value",
        "o"."maker" as "floor_sell_maker",
        date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from",
        (case when "t"."floor_sell_hash" is not null
          then coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0)
          else null
        end) as "floor_sell_valid_until"
      from "tokens" "t"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
      where "t"."collection_id" = $/collection/
      order by "t"."collection_id", "t"."floor_sell_value" asc
    ) "y"
      on "x"."id" = "y"."collection_id"
    left join (
      select distinct on ("ts"."collection_id")
        "ts"."collection_id",
        "o"."hash" as "top_buy_hash",
        "o"."value" as "top_buy_value",
        "o"."maker" as "top_buy_maker",
        date_part('epoch', lower("o"."valid_between")) as "top_buy_valid_from",
        (case when "o"."hash" is not null
          then coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0)
          else null
        end) as "top_buy_valid_until"
      from "orders" "o"
      join "token_sets" "ts"
        on "o"."token_set_id" = "ts"."id"
      where "ts"."collection_id" = $/collection/
      order by "ts"."collection_id", "o"."value" desc
    ) "z"
      on "x"."id" = "z"."collection_id"
    left join (
      select distinct on ("t"."last_sell_block")
        "t"."collection_id",
        "t"."last_sell_value",
        (
          case when "t"."last_sell_value" is not null
            then coalesce("b"."timestamp", extract(epoch from now())::int)
            else null
          end
        ) as "last_sell_timestamp"
      from "tokens" "t"
      left join "blocks" "b"
        on "t"."last_sell_block" = "b"."block"
      where "t"."collection_id" = $/collection/
      order by "t"."last_sell_block" desc nulls last, "t"."last_sell_value"
      limit 1
    ) "u"
      on "x"."id" = "u"."collection_id"
    left join (
      select distinct on ("t"."last_buy_block")
        "t"."collection_id",
        "t"."last_buy_value",
        (
          case when "t"."last_buy_value" is not null
            then coalesce("b"."timestamp", extract(epoch from now())::int)
            else null
          end
        ) as "last_buy_timestamp"
      from "tokens" "t"
      left join "blocks" "b"
        on "t"."last_buy_block" = "b"."block"
      where "t"."collection_id" = $/collection/
      order by "t"."last_buy_block" desc nulls last, "t"."last_buy_value" desc
      limit 1
    ) "v"
      on "x"."id" = "v"."collection_id"
  `;

  return db.oneOrNone(baseQuery, filter).then((r) => ({
    collection: {
      id: r.id,
      name: r.name,
      description: r.description,
      image: r.image,
      lastBuy: {
        value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
        timestamp: r.last_buy_timestamp,
      },
      lastSell: {
        value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
        timestamp: r.last_sell_timestamp,
      },
    },
    royalties: {
      recipient: r.royalty_recipient,
      bps: r.royalty_bps,
    },
    set: {
      tokenCount: Number(r.token_count),
      onSaleCount: Number(r.on_sale_count),
      sampleImages: r.sample_images,
      market: {
        floorSell: {
          hash: r.floor_sell_hash,
          value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
          maker: r.floor_sell_maker,
          validFrom: r.floor_sell_valid_from,
          validUntil: r.floor_sell_valid_until,
          token: r.floor_sell_token_contract && {
            contract: r.floor_sell_token_contract,
            tokenId: r.floor_sell_token_id,
            name: r.floor_sell_token_name,
            image: r.floor_sell_token_image,
          },
        },
        topBuy: {
          hash: r.top_buy_hash,
          value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          maker: r.top_buy_maker,
          validFrom: r.top_buy_valid_from,
          validUntil: r.top_buy_valid_until,
        },
      },
    },
  }));
};
