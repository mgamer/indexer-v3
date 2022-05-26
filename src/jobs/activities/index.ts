/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { SaleActivity, FillEventData } from "@/jobs/activities/sale-activity";
import { TransferActivity, NftTransferEventData } from "@/jobs/activities/transfer-activity";
import { ListingActivity, NewSellOrderData } from "@/jobs/activities/listing-activity";
import { BidActivity, NewBuyOrderData } from "@/jobs/activities/bid-activity";
import { BidCancelActivity, BuyOrderCancelledData } from "@/jobs/activities/bid-cancel-activity";
import {
  ListingCancelActivity,
  SellOrderCancelledData,
} from "@/jobs/activities/listing-cancel-activity";

const QUEUE_NAME = "activities-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 20000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as EventInfo;

      switch (kind) {
        case ActivityEvent.fillEvent:
          await SaleActivity.handleEvent(data as FillEventData);
          break;
        case ActivityEvent.nftTransferEvent:
          await TransferActivity.handleEvent(data as NftTransferEventData);
          break;
        case ActivityEvent.newSellOrder:
          await ListingActivity.handleEvent(data as NewSellOrderData);
          break;
        case ActivityEvent.newBuyOrder:
          await BidActivity.handleEvent(data as NewBuyOrderData);
          break;
        case ActivityEvent.buyOrderCancelled:
          await BidCancelActivity.handleEvent(data as BuyOrderCancelledData);
          break;
        case ActivityEvent.sellOrderCancelled:
          await ListingCancelActivity.handleEvent(data as SellOrderCancelledData);
          break;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum ActivityEvent {
  fillEvent = "fillEvent",
  nftTransferEvent = "nftTransferEvent",
  newSellOrder = "newSellOrder",
  newBuyOrder = "newBuyOrder",
  sellOrderCancelled = "sellOrderCancelled",
  buyOrderCancelled = "buyOrderCancelled",
}

export type EventInfo =
  | {
      kind: ActivityEvent.newSellOrder;
      data: NewSellOrderData;
    }
  | {
      kind: ActivityEvent.newBuyOrder;
      data: NewBuyOrderData;
    }
  | {
      kind: ActivityEvent.nftTransferEvent;
      data: NftTransferEventData;
    }
  | {
      kind: ActivityEvent.fillEvent;
      data: FillEventData;
    }
  | {
      kind: ActivityEvent.sellOrderCancelled;
      data: SellOrderCancelledData;
    }
  | {
      kind: ActivityEvent.buyOrderCancelled;
      data: BuyOrderCancelledData;
    };

export const addToQueue = async (events: EventInfo[]) => {
  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};
