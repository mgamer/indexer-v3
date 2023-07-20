/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { fromBuffer, formatEth } from "@/common/utils";
import { Assets } from "@/utils/assets";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

interface CollectionInfo {
  id: string;
  slug: string;
  name: string;
  metadata: any;
  royalties: any[];
  contract: Buffer;
  token_set_id: string;
  day1_rank: number;
  day1_volume: number;
  day7_rank: number;
  day7_volume: number;
  day30_rank: number;
  day30_volume: number;
  all_time_rank: number;
  all_time_volume: number;
  day1_volume_change: number;
  day7_volume_change: number;
  day30_volume_change: number;
  day1_floor_sell_value: string;
  day7_floor_sell_value: string;
  day30_floor_sell_value: string;
  token_count: number;
  owner_count: number;
  floor_sell_id: string;
  floor_sell_value: string;
  floor_sell_maker: Buffer;
  floor_sell_valid_between: string[];
  normalized_floor_sell_id: string;
  normalized_floor_sell_value: string;
  normalized_floor_sell_maker: Buffer;
  normalized_floor_sell_valid_between: string[];
  non_flagged_floor_sell_id: string;
  non_flagged_floor_sell_value: string;
  non_flagged_floor_sell_maker: Buffer;
  non_flagged_floor_sell_valid_between: string[];
  top_buy_id: string;
  top_buy_value: string;
  top_buy_maker: Buffer;
  top_buy_valid_between: string[];
}

export type CollectionWebsocketEventInfo = {
  before: CollectionInfo;
  after: CollectionInfo;
  trigger: "insert" | "update";
};

const changedMapping = {
  slug: "slug",
  name: "name",
  metadata: "metadata",
  royalties: "royalties",
  token_set_id: "tokenSetId",
  day1_rank: "rank.1day",
  day7_rank: "rank.7day",
  day30_rank: "rank.30day",
  all_time_rank: "rank.allTime",
  day1_volume: "volume.1day",
  day7_volume: "volume.7day",
  day30_volume: "volume.30day",
  all_time_volume: "volume.allTime",
  day1_volume_change: "volumeChange.1day",
  day7_volume_change: "volumeChange.7day",
  day30_volume_change: "volumeChange.30day",
  day1_floor_sell_value: "floorSale.1day",
  day7_floor_sell_value: "floorSale.7day",
  day30_floor_sell_value: "floorSale.30day",
  token_count: "tokenCount",
  owner_count: "ownerCount",
  floor_sell_id: "floorAsk.id",
  floor_sell_value: "floorAsk.price",
  normalized_floor_sell_id: "floorAskNormalized.id",
  normalized_floor_sell_value: "floorAskNormalized.price",
  non_flagged_floor_sell_id: "floorAskNonFlagged.id",
  non_flagged_floor_sell_value: "floorAskNonFlagged.price",
  top_buy_id: "topBid.id",
  top_buy_value: "topBid.value",
};

export type CollectionWebsocketEventsTriggerQueuePayload = {
  data: CollectionWebsocketEventInfo;
};

export class CollectionWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: CollectionWebsocketEventsTriggerQueuePayload) {
    const { data } = payload;

    try {
      let eventType = "";
      const changed = [];
      if (data.trigger === "insert") eventType = "collection.created";
      else if (data.trigger === "update") {
        eventType = "collection.updated";
        if (data.before) {
          for (const key in changedMapping) {
            if (
              data.before[key as keyof CollectionInfo] !== data.after[key as keyof CollectionInfo]
            ) {
              changed.push(changedMapping[key as keyof typeof changedMapping]);
            }
          }
        }

        if (!changed.length) {
          logger.info(
            this.queueName,
            `No changes detected for event. before=${JSON.stringify(
              before
            )}, after=${JSON.stringify(after)}`
          );
          return;
        }
      }

      const a = data.after;

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          id: a.id,
        },
        changed,
        data: {
          id: a.id,
          slug: a.slug,
          name: a.name,
          metadata: {
            ...a.metadata,
            imageUrl: Assets.getLocalAssetsLink(a.metadata?.imageUrl),
          },
          tokenCount: String(a.token_count),
          primaryContract: fromBuffer(a.contract),
          tokenSetId: a.token_set_id,
          royalties: a.royalties ? a.royalties[0] : null,
          topBid: {
            id: a.top_buy_id,
            value: a.top_buy_value ? formatEth(a.top_buy_value) : null,
            maker: a.top_buy_maker ? fromBuffer(a.top_buy_maker) : null,
            validFrom: a.top_buy_valid_between[0],
            validUntil: a.top_buy_value ? a.top_buy_valid_between[1] : null,
          },
          rank: {
            "1day": a.day1_rank,
            "7day": a.day7_rank,
            "30day": a.day30_rank,
            allTime: a.all_time_rank,
          },
          volume: {
            "1day": a.day1_volume ? formatEth(a.day1_volume) : null,
            "7day": a.day7_volume ? formatEth(a.day7_volume) : null,
            "30day": a.day30_volume ? formatEth(a.day30_volume) : null,
            allTime: a.all_time_volume ? formatEth(a.all_time_volume) : null,
          },
          volumeChange: {
            "1day": a.day1_volume_change,
            "7day": a.day7_volume_change,
            "30day": a.day30_volume_change,
          },
          floorSale: {
            "1day": a.day1_floor_sell_value ? formatEth(a.day1_floor_sell_value) : null,
            "7day": a.day7_floor_sell_value ? formatEth(a.day7_floor_sell_value) : null,
            "30day": a.day30_floor_sell_value ? formatEth(a.day30_floor_sell_value) : null,
          },
          floorSaleChange: {
            "1day": Number(a.day1_floor_sell_value)
              ? Number(a.floor_sell_value) / Number(a.day1_floor_sell_value)
              : null,
            "7day": Number(a.day7_floor_sell_value)
              ? Number(a.floor_sell_value) / Number(a.day7_floor_sell_value)
              : null,
            "30day": Number(a.day30_floor_sell_value)
              ? Number(a.floor_sell_value) / Number(a.day30_floor_sell_value)
              : null,
          },
          ownerCount: Number(a.owner_count),
          floorAsk: {
            id: a.floor_sell_id,
            price: a.floor_sell_id ? formatEth(a.floor_sell_value) : null,
            maker: a.floor_sell_id ? fromBuffer(a.floor_sell_maker) : null,
            validFrom: a.floor_sell_valid_between[0],
            validUntil: a.floor_sell_id ? a.floor_sell_valid_between[1] : null,
          },
          floorAskNormalized: {
            id: a.normalized_floor_sell_id,
            price: a.normalized_floor_sell_id ? formatEth(a.normalized_floor_sell_value) : null,
            maker: a.normalized_floor_sell_id ? fromBuffer(a.normalized_floor_sell_maker) : null,
            validFrom: a.normalized_floor_sell_valid_between[0],
            validUntil: a.normalized_floor_sell_id
              ? a.normalized_floor_sell_valid_between[1]
              : null,
          },
          floorAskNonFlagged: {
            id: a.non_flagged_floor_sell_id,
            price: a.non_flagged_floor_sell_id ? formatEth(a.non_flagged_floor_sell_value) : null,
            maker: a.non_flagged_floor_sell_id ? fromBuffer(a.non_flagged_floor_sell_maker) : null,
            validFrom: a.non_flagged_floor_sell_valid_between[0],
            validUntil: a.non_flagged_floor_sell_id
              ? a.non_flagged_floor_sell_valid_between[1]
              : null,
          },
        },
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );
      throw error;
    }
  }

  public async addToQueue(events: CollectionWebsocketEventsTriggerQueuePayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export const collectionWebsocketEventsTriggerQueueJob =
  new CollectionWebsocketEventsTriggerQueueJob();
