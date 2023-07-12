import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { idb } from "@/common/db";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "attribute-websocket-events-trigger-queue";

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
              t.contract,
              t.token_id,
              t.name,
              t.description,
            (
              SELECT
                array_agg(
                  json_build_object(
                    'key', ta.key,
                    'kind', attributes.kind,
                    'value', ta.value,
                    'createdAt', ta.created_at,
                    'tokenCount', attributes.token_count,
                    'onSaleCount', attributes.on_sale_count,
                    'floorAskPrice', attributes.floor_sell_value::TEXT,
                    'topBidValue', attributes.top_buy_value::TEXT
                  )
                )
              FROM token_attributes ta
              JOIN attributes
                ON ta.attribute_id = attributes.id
              WHERE ta.contract = t.contract
                AND ta.token_id = t.token_id
                AND ta.key != ''
            ) AS attributes      
            FROM "tokens" "t"
      `;

        // Filters

        const conditions: string[] = [];
        conditions.push(`t.contract = $/contract/`);
        conditions.push(`t.token_id = $/tokenId/`);

        if (conditions.length) {
          baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
        }

        baseQuery += ` LIMIT 1`;

        const rawResult = await idb.manyOrNone(baseQuery, {
          contract: toBuffer(data.after.contract),
          tokenId: data.after.token_id,
        });

        const r = rawResult[0];

        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

        const result = {
          token: {
            contract,
            tokenId,
            name: r.name,
            description: r.description,
          },
          attributes: _.map(r.attributes, (attribute) => ({
            key: attribute.key,
            kind: attribute.kind,
            value: attribute.value,
            tokenCount: attribute.tokenCount,
            onSaleCount: attribute.onSaleCount,
            floorAskPrice: attribute.floorAskPrice
              ? formatEth(attribute.floorAskPrice)
              : attribute.floorAskPrice,
            topBidValue: attribute.topBidValue
              ? formatEth(attribute.topBidValue)
              : attribute.topBidValue,
            createdAt: new Date(attribute.createdAt).toISOString(),
          })),
        };

        let eventType = "";
        switch (data.trigger) {
          case "insert":
            eventType = "attributes.created";
            break;
          case "update":
            eventType = "attributes.updated";
            break;
          case "delete":
            eventType = "attributes.deleted";
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
  data: AttributeWebsocketEventInfo;
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

interface AttributeInfo {
  contract: string;
  token_id: string;
}

export type AttributeWebsocketEventInfo = {
  before: AttributeInfo;
  after: AttributeInfo;
  trigger: "insert" | "update" | "delete";
};
