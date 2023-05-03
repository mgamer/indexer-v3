import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";

import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

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
        const r = await idb.oneOrNone(
          `
          SELECT 
            nft_balances.contract,
            nft_balances.token_id,
            nft_balances.owner,
            nft_balances.amount,
            nft_balances.acquired_at,
            nft_balances.floor_sell_id,
            nft_balances.floor_sell_value,
            nft_balances.top_buy_id,
            nft_balances.top_buy_value,
            nft_balances.top_buy_maker,
            nft_balances.last_token_appraisal_value,
          FROM nft_balances
          WHERE 
            contract = $/contract/ AND
            token_id = $/tokenId/ AND
            owner = $/owner/
        `,
          { contract: toBuffer(data.contract), tokenId: data.tokenId, owner: toBuffer(data.owner) }
        );

        const result = {
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          owner: fromBuffer(r.owner),
          amount: r.amount,
          acquiredAt: r.acquired_at,
          floorSell: {
            id: r.floor_sell_id,
            value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
          },
          topBid: r.top_buy_id
            ? {
                id: r.top_buy_id,
                value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
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
              contract: fromBuffer(r.contract),
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
  contract: string;
  tokenId: string;
  owner: string;
  trigger: "insert" | "update" | "delete";
};
