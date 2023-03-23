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
import * as Sdk from "@reservoir0x/sdk";

export class NewTopBidWebsocketEvent {
  public static async triggerEvent(data: NewTopBidWebsocketEventInfo) {
    const criteriaBuildQuery = Orders.buildCriteriaQuery("orders", "token_set_id", false);
    const sources = await Sources.getInstance();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseFloorPrice = async (type: "normalized_" | "non_flagged_" | "", order: any) => {
      const floorAskCurrency = order[`${type}floor_order_currency`]
        ? fromBuffer(order[`${type}floor_order_currency`])
        : Sdk.Common.Addresses.Eth[config.chainId];
      return {
        id: order[`${type}floor_sell_id`],
        sourceDomain: sources.get(Number(order[`${type}floor_sell_source_id_int`]))?.domain,
        price: order[`${type}floor_sell_id`]
          ? await getJoiPriceObject(
              {
                gross: {
                  amount:
                    order[`${type}floor_order_currency_value`] ?? order[`${type}floor_sell_value`],
                  nativeAmount: order[`${type}floor_sell_value`],
                },
              },
              floorAskCurrency
            )
          : null,
      };
    };

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
                c.id as collection_id,
                c.slug as collection_slug,
                c.name as collection_name,
                c.normalized_floor_sell_id AS normalized_floor_sell_id,
                c.normalized_floor_sell_value AS normalized_floor_sell_value,
                c.normalized_floor_sell_source_id_int AS normalized_floor_sell_source_id_int,
                normalized_floor_order.currency as normalized_floor_order_currency,
                normalized_floor_order.currency_value as normalized_floor_order_currency_value,
                c.floor_sell_id AS floor_sell_id,
                c.floor_sell_value AS floor_sell_value,
                c.floor_sell_source_id_int AS floor_sell_source_id_int,
                floor_order.currency as floor_order_currency,
                floor_order.currency_value as floor_order_currency_value,
                c.non_flagged_floor_sell_id AS non_flagged_floor_sell_id,
                c.non_flagged_floor_sell_value AS non_flagged_floor_sell_value,
                c.non_flagged_floor_sell_source_id_int AS non_flagged_floor_sell_source_id_int,
                non_flagged_floor_order.currency as non_flagged_floor_order_currency,
                non_flagged_floor_order.currency_value as non_flagged_floor_order_currency_value


              FROM orders
                JOIN collections c on orders.contract = c.contract
                JOIN orders normalized_floor_order ON c.normalized_floor_sell_id = normalized_floor_order.id
                JOIN orders non_flagged_floor_order ON c.non_flagged_floor_sell_id = non_flagged_floor_order.id
                JOIN orders floor_order ON c.floor_sell_id = floor_order.id
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
        },
        owners: ownersChunk,
        colllection: {
          id: order.collection_id,
          slug: order.collection_slug,
          name: order.collection_name,
          floorAsk: await parseFloorPrice("", order),
          floorAskNormalized: await parseFloorPrice("normalized_", order),
          floorAskNonflagged: await parseFloorPrice("non_flagged_", order),
        },
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
