import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { redb } from "@/common/db";
import { fromBuffer, toBuffer, formatEth } from "@/common/utils";
import { Assets } from "@/utils/assets";

import { Sources } from "@/models/sources";

const QUEUE_NAME = "collection-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        let baseQuery = `
        SELECT
          "c"."id",
          "c"."slug",
          "c"."name",
          "c"."metadata",
          "c"."royalties",
          "c"."contract",
          "c"."token_id_range",
          "c"."token_set_id",
          "c"."day1_rank",
          "c"."day1_volume",
          "c"."day7_rank",
          "c"."day7_volume",
          "c"."day30_rank",
          "c"."day30_volume",
          "c"."all_time_rank",
          "c"."all_time_volume",
          "c"."day1_volume_change",
          "c"."day7_volume_change",
          "c"."day30_volume_change",
          "c"."day1_floor_sell_value",
          "c"."day7_floor_sell_value",
          "c"."day30_floor_sell_value",               
          "c"."token_count",
          (
            SELECT COUNT(*) FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
              AND "t"."floor_sell_value" IS NOT NULL
          ) AS "on_sale_count",
          ARRAY(
            SELECT "t"."image" FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
            AND "t"."image" IS NOT NULL
            LIMIT 4
          ) AS "sample_images"          
        FROM "collections" "c"
      `;

        // Filters

        const conditions: string[] = [];
        conditions.push(`c.id = $/id/`);

        if (conditions.length) {
          baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
        }

        baseQuery += ` LIMIT 1`;

        const sources = await Sources.getInstance();
        const result = await redb
          .oneOrNone(baseQuery, { contract: toBuffer(data.after.id) })
          .then((r) =>
            !r
              ? null
              : {
                  id: r.id,
                  slug: r.slug,
                  name: r.name,
                  metadata: {
                    ...r.metadata,
                    imageUrl:
                      Assets.getLocalAssetsLink(r.metadata?.imageUrl) ||
                      (r.sample_images?.length
                        ? Assets.getLocalAssetsLink(r.sample_images[0])
                        : null),
                  },
                  sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
                  tokenCount: String(r.token_count),
                  onSaleCount: String(r.on_sale_count),
                  primaryContract: fromBuffer(r.contract),
                  tokenSetId: r.token_set_id,
                  royalties: r.royalties ? r.royalties[0] : null,
                  lastBuy: {
                    value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                    timestamp: r.last_buy_timestamp,
                  },
                  floorAsk: {
                    id: r.floor_sell_id,
                    sourceDomain: sources.get(r.floor_sell_source_id_int)?.domain,
                    price: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
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
                  /*
                topBid: query.includeTopBid
                    ? {
                        id: r.top_buy_id,
                        value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                        maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                        validFrom: r.top_buy_valid_from,
                        validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                    }
                    : undefined,
                */
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
                  ownerCount: Number(r.ownerCount),
                  attributes: _.map(_.sortBy(r.attributes, ["rank", "key"]), (attribute) => ({
                    key: attribute.key,
                    kind: attribute.kind,
                    count: Number(attribute.count),
                  })),
                }
          );

        let eventType = "";
        // const changed = [];
        if (data.trigger === "insert") eventType = "collection.created";
        else if (data.trigger === "update") {
          eventType = "collection.updated";
          // if (data.before) {
          //   for (const key in changedMapping) {
          //     // eslint-disable-next-line
          //     // @ts-ignore
          //     if (data.before[key] && data.after[key] && data.before[key] !== data.after[key]) {
          //       changed.push(key);
          //     }
          //   }
          // }

          // if (!changed.length) {
          //   return;
          // }
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            id: data.after.id,
          },
          // changed: [],
          data: result,
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
            error
          )}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: CollectionWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};

interface CollectionInfo {
  id: string;
  slug: string;
  name?: string;
  metadata?: object;
  sampleImages?: string[];
  tokenCount?: string;
  onSaleCount?: string;
  primaryContract?: string;
  tokenSetId?: string;
  royalties?: object;
  lastBuy?: object;
  floorAsk?: string;
  floor_sell_valid_to?: string;
  floor_sell_source_id?: string;
  floor_sell_source_id_int?: string;
  floor_sell_is_reservoir?: string;
  top_buy_id?: string;
  top_buy_value?: string;
  top_buy_maker?: string;
  last_sell_timestamp?: string;
  last_sell_value?: string;
  last_buy_timestamp?: string;
  last_buy_value?: string;
  last_metadata_sync?: string;
  created_at?: string;
  updated_at?: string;
  rarity_score?: string;
  rarity_rank?: string;
  is_flagged?: string;
  last_flag_update?: string;
  floor_sell_currency?: string;
  floor_sell_currency_value?: string;
  minted_timestamp?: number;
  normalized_floor_sell_id?: string;
  normalized_floor_sell_value?: string;
  normalized_floor_sell_maker?: string;
  normalized_floor_sell_valid_from?: string;
  normalized_floor_sell_valid_to?: string;
  normalized_floor_sell_source_id_int?: string;
  normalized_floor_sell_is_reservoir?: string;
  normalized_floor_sell_currency?: string;
  normalized_floor_sell_currency_value?: string;
  last_flag_change?: string;
  supply?: string;
  remaining_supply?: string;
}

export type CollectionWebsocketEventInfo = {
  before: CollectionInfo;
  after: CollectionInfo;
  trigger: "insert" | "update";
};
