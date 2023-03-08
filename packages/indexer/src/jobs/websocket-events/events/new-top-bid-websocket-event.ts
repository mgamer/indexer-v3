import { idb, redb } from "@/common/db";
import * as Pusher from "pusher";
import { fromBuffer, now } from "@/common/utils";
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
