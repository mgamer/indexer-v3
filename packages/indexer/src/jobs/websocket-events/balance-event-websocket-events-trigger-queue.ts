import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { formatEth } from "@/common/utils";

import { redisWebsocketPublisher } from "@/common/redis";

const QUEUE_NAME = "balance-websocket-events-trigger-queue";

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
        const { eventData } = data;
        const result = {
          contract: eventData.contract,
          tokenId: eventData.token_id,
          owner: eventData.owner,
          amount: eventData.amount,
          acquiredAt: eventData.acquired_at,
          floorSell: {
            id: eventData.floor_sell_id,
            value: eventData.floor_sell_value ? formatEth(eventData.floor_sell_value) : null,
          },
          topBid: eventData.top_buy_id
            ? {
                id: eventData.top_buy_id,
                value: eventData.top_buy_value ? formatEth(eventData.top_buy_value) : null,
                maker: eventData.top_buy_maker ? eventData.top_buy_maker : null,
              }
            : null,
        };

        let eventType = "";
        if (data.trigger === "insert") eventType = "balance.created";
        else if (data.trigger === "update") eventType = "balance.updated";

        await redisWebsocketPublisher.publish(
          "events",
          JSON.stringify({
            event: eventType,
            tags: {
              contract: eventData.contract,
            },
            data: result,
          })
        );
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
    { connection: redis.duplicate(), concurrency: 80 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: BalanceWebsocketEventInfo;
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

export type BalanceWebsocketEventInfo = {
  eventData: {
    contract: string;
    token_id: string;
    owner: string;
    amount: string;
    acquired_at: string;
    floor_sell_id: string;
    floor_sell_value: string;
    top_buy_id: string;
    top_buy_value: string;
    top_buy_maker: string;
    last_token_appraisal_value: string;
  };

  trigger: "insert" | "update" | "delete";
};
