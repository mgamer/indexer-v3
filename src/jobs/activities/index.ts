/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { SaleActivity } from "@/jobs/activities/sale-activity";
import { TransferActivity } from "@/jobs/activities/transfer-activity";
import { MintActivity } from "@/jobs/activities/mint-activity";
import { ActivityMetadata } from "@/models/activities/activities-entity";

const QUEUE_NAME = "activities-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: false,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { activity } = job.data;

      switch (activity.event) {
        case ActivityEvent.sale:
          await SaleActivity.handleEvent(activity);
          break;

        case ActivityEvent.listing:
          break;

        case ActivityEvent.transfer:
          await TransferActivity.handleEvent(activity);
          break;

        case ActivityEvent.mint:
          await MintActivity.handleEvent(activity);
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
  sale = "sale",
  listing = "listing",
  transfer = "transfer",
  mint = "mint",
}

export type ActivityInfo = {
  event: ActivityEvent;
  contract: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;
  metadata?: ActivityMetadata;
  timestamp?: number; // For on-chain events use the blockchain timestamp
};

export const addToQueue = async (activities: ActivityInfo[]) => {
  await queue.addBulk(
    _.map(activities, (activity) => ({
      name: randomUUID(),
      data: { activity },
    }))
  );
};
