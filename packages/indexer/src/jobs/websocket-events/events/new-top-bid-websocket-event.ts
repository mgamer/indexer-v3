import { idb, redb } from "@/common/db";
import * as Pusher from "pusher";
import { formatEth, fromBuffer, now, toBuffer } from "@/common/utils";
import { Orders } from "@/utils/orders";
import _ from "lodash";
import { config } from "@/config/index";
import { redis } from "@/common/redis";
import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";
import { getJoiPriceObject } from "@/common/joi";
import { Assets } from "@/utils/assets";
import * as Sdk from "@reservoir0x/sdk";

export class NewTopBidWebsocketEvent {
  public static async triggerEvent(data: NewTopBidWebsocketEventInfo) {
    const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);

    const order = await idb.oneOrNone(
      `
              SELECT
                orders.id,
                orders.token_set_id,
                orders.source_id_int,
                orders.nonce,
                orders.maker,
                orders.price,
                orders.value,
                orders.currency_value,
                orders.currency_price,
                orders.currency,
                orders.normalized_value,
                orders.currency_normalized_value,               
                orders.created_at,
                DATE_PART('epoch', LOWER(orders.valid_between)) AS "valid_from",
                COALESCE(
                     NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
                     0
                   ) AS "valid_until",
                (${criteriaBuildQuery}) AS criteria,
                c.normalized_floor_sell_id AS floor_sell_id,
                c.normalized_floor_sell_value AS floor_sell_value,
                c.normalized_floor_sell_maker AS floor_sell_maker,
                least(2147483647::NUMERIC, date_part('epoch', lower(c.normalized_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
                least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(c.normalized_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
                c.normalized_floor_sell_source_id_int AS floor_sell_source_id_int,
                floor_token.contract AS floor_sell_token_contract,
                floor_token.token_id AS floor_sell_token_id,
                floor_token.name AS floor_sell_token_name,
                floor_token.image AS floor_sell_token_image,
                orders.currency AS floor_sell_currency,
                orders.currency_value AS floor_sell_currency_value
              FROM orders
                JOIN collections c on orders.contract = c.contract
                JOIN orders floor_order on orders.id = floor_sell_id
                JOIN token_sets_tokens floor_token_sets ON floor_token_sets.token_set_id = floor_order.token_set_id
                JOIN tokens floor_token ON floor_token.contract = floor_token_sets.contract AND floor_token.token_id = floor_token_sets.token_id

              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
      { orderId: data.orderId }
    );

    if (await NewTopBidWebsocketEvent.isRateLimited(order.token_set_id)) {
      logger.info(
        "new-top-bid-websocket-event",
        `Rate limited. orderId=${data.orderId}, tokenSetId=${order.token_set_id}`
      );

      return;
    }

    const payloads = [];
    const owners = await NewTopBidWebsocketEvent.getOwners(order.token_set_id);
    const ownersChunks = _.chunk(owners, Number(config.websocketServerEventMaxSizeInKb) * 20);
    const source = (await Sources.getInstance()).get(Number(order.source_id_int));
    const colllection = await NewTopBidWebsocketEvent.getCollection(order.contract);

    for (const ownersChunk of ownersChunks) {
      const floor_ask_currency = order.floor_sell_currency
        ? fromBuffer(order.floor_sell_currency)
        : Sdk.Common.Addresses.Eth[config.chainId];

      payloads.push({
        order: {
          id: order.id,
          maker: fromBuffer(order.maker),
          createdAt: new Date(order.created_at).toISOString(),
          validFrom: order.valid_from,
          validUntil: order.valid_until,
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
          },
          price: await getJoiPriceObject(
            {
              net: {
                amount: order.currency_value ?? order.value,
                nativeAmount: order.value,
              },
              gross: {
                amount: order.currency_price ?? order.price,
                nativeAmount: order.price,
              },
            },
            fromBuffer(order.currency)
          ),
          priceNormalized: await getJoiPriceObject(
            {
              net: {
                amount: order.currency_normalized_value ?? order.currency_value ?? order.value,
                nativeAmount: order.normalized_value ?? order.value,
              },
              gross: {
                amount: order.currency_price ?? order.price,
                nativeAmount: order.price,
              },
            },
            fromBuffer(order.currency)
          ),
          criteria: order.criteria,
          floorAsk: {
            id: order.floor_sell_id,
            sourceDomain: order.get(order.floor_sell_source_id_int)?.domain,
            price: order.floor_sell_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: order.floor_sell_value,
                      nativeAmount: order.floor_sell_value,
                    },
                  },
                  floor_ask_currency
                )
              : null,
            maker: order.floor_sell_maker ? fromBuffer(order.floor_sell_maker) : null,
            validFrom: order.floor_sell_valid_from,
            validUntil: order.floor_sell_value ? order.floor_sell_valid_until : null,
            token: order.floor_sell_value && {
              contract: order.floor_sell_token_contract
                ? fromBuffer(order.floor_sell_token_contract)
                : null,
              tokenId: order.floor_sell_token_id,
              name: order.floor_sell_token_name,
              image: Assets.getLocalAssetsLink(order.floor_sell_token_image),
            },
          },
        },
        owners: ownersChunk,
        colllection: colllection,
      });
    }

    const server = new Pusher.default({
      appId: config.websocketServerAppId,
      key: config.websocketServerAppKey,
      secret: config.websocketServerAppSecret,
      host: config.websocketServerHost,
      useTLS: true,
    });

    if (payloads.length > 1) {
      const payloadsBatches = _.chunk(payloads, Number(config.websocketServerEventMaxBatchSize));

      await Promise.all(
        payloadsBatches.map((payloadsBatch) =>
          server.triggerBatch(
            payloadsBatch.map((payload) => {
              return {
                channel: "top-bids",
                name: "new-top-bid",
                data: JSON.stringify(payload),
              };
            })
          )
        )
      );
    } else {
      await server.trigger("top-bids", "new-top-bid", JSON.stringify(payloads[0]));
    }
  }

  static async getOwners(tokenSetId: string): Promise<string[]> {
    let owners: string[] | undefined = undefined;

    const ownersString = await redis.get(`token-set-owners:${tokenSetId}`);

    if (ownersString) {
      owners = JSON.parse(ownersString);
    }

    if (!owners) {
      owners = (
        await redb.manyOrNone(
          `
                SELECT
                  DISTINCT nb.owner
                FROM nft_balances nb
                JOIN token_sets_tokens tst ON tst.contract = nb.contract AND tst.token_id = nb.token_id
                WHERE tst.token_set_id = $/tokenSetId/
                  AND nb.amount > 0
              `,
          {
            tokenSetId,
          }
        )
      ).map((result) => fromBuffer(result.owner));

      await redis.set(`token-set-owners:${tokenSetId}`, JSON.stringify(owners), "EX", 60);
    }

    return owners;
  }

  static async getCollection(contract: string) {
    try {
      const floorAskSelectQueryNormal = `collections.floor_sell_id,
            collections.floor_sell_value,
            collections.floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.floor_sell_source_id_int,`;

      // let floorAskSelectQueryFlagged = `
      //    collections.non_flagged_floor_sell_value AS floor_sell_value,
      //       collections.non_flagged_floor_sell_maker AS floor_sell_maker,
      //       least(2147483647::NUMERIC, date_part('epoch', lower(collections.non_flagged_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
      //       least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.non_flagged_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
      //       collections.non_flagged_floor_sell_source_id_int AS floor_sell_source_id_int,`;

      // let normalRoyaltiesFloor = `  collections.normalized_floor_sell_id AS floor_sell_id,
      //       collections.normalized_floor_sell_value AS floor_sell_value,
      //       collections.normalized_floor_sell_maker AS floor_sell_maker,
      //       least(2147483647::NUMERIC, date_part('epoch', lower(collections.normalized_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
      //       least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.normalized_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
      //       collections.normalized_floor_sell_source_id_int AS floor_sell_source_id_int,`;

      let baseQuery = `
        SELECT
          collections.id,
          collections.slug,
          collections.name,
          (collections.metadata ->> 'imageUrl')::TEXT AS "image",
          (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
          (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
          (collections.metadata ->> 'description')::TEXT AS "description",
          (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
          (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
          (collections.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
          collections.royalties,
          collections.new_royalties,
          collections.contract,
          collections.token_id_range,
          collections.token_set_id,
          collections.day1_rank,
          collections.day1_volume,
          collections.day7_rank,
          collections.day7_volume,
          collections.day30_rank,
          collections.day30_volume,
          collections.all_time_rank,
          collections.all_time_volume,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          collections.day1_floor_sell_value,
          collections.day7_floor_sell_value,
          collections.day30_floor_sell_value,
          ${floorAskSelectQueryNormal}
          collections.token_count,
          collections.created_at,
          (
            SELECT
              COUNT(*)
            FROM tokens
            WHERE tokens.collection_id = collections.id
              AND tokens.floor_sell_value IS NOT NULL
          ) AS on_sale_count,
          ARRAY(
            SELECT
              tokens.image
            FROM tokens
            WHERE tokens.collection_id = collections.id
            LIMIT 4
          ) AS sample_images,
          (
            SELECT kind FROM contracts WHERE contracts.address = collections.contract
          )  as contract_kind
        FROM collections
      `;

      // Filtering

      const conditions: string[] = [];

      conditions.push(`collections.contract IN ($/contract:csv/)`);

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT
          x.*,
          y.*
        FROM x
        LEFT JOIN LATERAL (
           SELECT
             tokens.contract AS floor_sell_token_contract,
             tokens.token_id AS floor_sell_token_id,
             tokens.name AS floor_sell_token_name,
             tokens.image AS floor_sell_token_image,
             orders.currency AS floor_sell_currency,
             orders.currency_value AS floor_sell_currency_value
           FROM orders
           JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id
           JOIN tokens ON tokens.contract = token_sets_tokens.contract AND tokens.token_id = token_sets_tokens.token_id
           WHERE orders.id = x.floor_sell_id
        ) y ON TRUE
      `;

      const results = await redb.manyOrNone(baseQuery, {
        contract: toBuffer(contract),
      });

      const sources = await Sources.getInstance();
      const collections = await Promise.all(
        results.map(async (r) => {
          // Use default currencies for backwards compatibility with entries
          // that don't have the currencies cached in the tokens table
          const floorAskCurrency = r.floor_sell_currency
            ? fromBuffer(r.floor_sell_currency)
            : Sdk.Common.Addresses.Eth[config.chainId];
          const sampleImages = _.filter(
            r.sample_images,
            (image) => !_.isNull(image) && _.startsWith(image, "http")
          );

          return {
            id: r.id,
            slug: r.slug,
            createdAt: new Date(r.created_at).toISOString(),
            name: r.name,
            image:
              r.image ?? (sampleImages.length ? Assets.getLocalAssetsLink(sampleImages[0]) : null),
            banner: r.banner,
            discordUrl: r.discord_url,
            externalUrl: r.external_url,
            twitterUsername: r.twitter_username,
            openseaVerificationStatus: r.opensea_verification_status,
            description: r.description,
            sampleImages: Assets.getLocalAssetsLink(sampleImages) ?? [],
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            primaryContract: fromBuffer(r.contract),
            tokenSetId: r.token_set_id,
            royalties: r.royalties
              ? {
                  // Main recipient, kept for backwards-compatibility only
                  recipient: r.royalties.length ? r.royalties[0].recipient : null,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  breakdown: r.royalties.filter((r: any) => r.bps && r.recipient),
                  bps: r.royalties
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((r: any) => r.bps)
                    .reduce((a: number, b: number) => a + b, 0),
                }
              : null,
            allRoyalties: r.new_royalties ?? null,
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            floorAsk: {
              id: r.floor_sell_id,
              sourceDomain: sources.get(r.floor_sell_source_id_int)?.domain,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: r.floor_sell_value,
                      },
                    },
                    floorAskCurrency
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_valid_from,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
              token: r.floor_sell_value && {
                contract: r.floor_sell_token_contract
                  ? fromBuffer(r.floor_sell_token_contract)
                  : null,
                tokenId: r.floor_sell_token_id,
                name: r.floor_sell_token_name,
                image: Assets.getLocalAssetsLink(r.floor_sell_token_image),
              },
            },
            rank: {
              "1day": r.day1_rank,
              "7day": r.day7_rank,
              "30day": r.day30_rank,
              allTime: r.all_time_rank,
            },
            volume: {
              "1day": r.day1_volume ? formatEth(r.day1_volume) : null,
              "7day": r.day7_volume ? formatEth(r.day7_volume) : null,
              "30day": r.day30_volume ? formatEth(r.day30_volume) : null,
              allTime: r.all_time_volume ? formatEth(r.all_time_volume) : null,
            },
            volumeChange: {
              "1day": r.day1_volume_change,
              "7day": r.day7_volume_change,
              "30day": r.day30_volume_change,
            },
            floorSale: {
              "1day": r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
              "7day": r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
              "30day": r.day30_floor_sell_value ? formatEth(r.day30_floor_sell_value) : null,
            },
            floorSaleChange: {
              "1day": Number(r.day1_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
                : null,
              "7day": Number(r.day7_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
                : null,
              "30day": Number(r.day30_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
                : null,
            },

            collectionBidSupported: Number(r.token_count) <= config.maxTokenSetSize,

            contractKind: r.contract_kind,
          };
        })
      );

      // Pagination

      return collections[0];
    } catch (error) {
      logger.error(`get-collections-top-bid-event`, `Event failure: ${error}`);
      throw error;
    }
  }

  static async isRateLimited(tokenSetId: string): Promise<boolean> {
    const setResult = await redis.set(
      `new-top-bid-rate-limiter:${tokenSetId}`,
      now(),
      "EX",
      60,
      "NX"
    );
    return setResult === null;
  }
}

export type NewTopBidWebsocketEventInfo = {
  orderId: string;
};
