import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "token-attribute-websocket-events-trigger-queue";

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
        const baseQuery = `
          SELECT
            ta.contract,
            ta.token_id,
            ta.collection_id,
            ta.key,
            ta.value,
            ta.created_at,
            ta.updated_at           
          FROM token_attributes ta
          WHERE ta.contract = $/contract/
            AND ta.token_id = $/tokenId/
            AND ta.key != ''
          LIMIT 1
      `;

        const result = await redb
          .oneOrNone(baseQuery, {
            contract: toBuffer(data.after.contract),
            tokenId: data.after.token_id,
          })
          .then((r) =>
            !r
              ? null
              : {
                  token: {
                    contract: fromBuffer(r.contract),
                    tokenId: r.token_id,
                  },
                  collection: {
                    id: r.collection_id,
                  },
                  key: r.key,
                  value: r.value,
                }
          );

        let eventType = "";
        switch (data.trigger) {
          case "insert":
            eventType = "token-attributes.created";
            break;
          case "update":
            eventType = "token-attributes.updated";
            break;
          case "delete":
            eventType = "token-attributes.deleted";
            break;
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            token_id: data.after.token_id,
            contract: data.after.contract,
          },
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
  data: TokenAttributeWebsocketEventInfo;
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

interface TokenAttributeInfo {
  contract: string;
  token_id: string;
}

export type TokenAttributeWebsocketEventInfo = {
  before: TokenAttributeInfo;
  after: TokenAttributeInfo;
  trigger: "insert" | "update" | "delete";
};
