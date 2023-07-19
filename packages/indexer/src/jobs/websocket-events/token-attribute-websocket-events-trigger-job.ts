import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TokenAttributeWebsocketEventsTriggerQueueJobPayload = {
  data: TokenAttributeWebsocketEventInfo;
};

// TODO - populate mapping based on update logs
const changedMapping = {};

export class TokenAttributeWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-attribute-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: TokenAttributeWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

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
                createdAt: r.created_at,
                updatedAt: r.updated_at,
              }
        );

      let eventType = "";
      const changed = [];
      switch (data.trigger) {
        case "insert":
          eventType = "token-attributes.created";
          break;
        case "update":
          eventType = "token-attributes.updated";
          if (data.before) {
            for (const key in changedMapping) {
              // eslint-disable-next-line
              // @ts-ignore
              if (data.before[key] !== data.after[key]) {
                changed.push(key);
              }
            }

            if (!changed.length) {
              logger.info(
                this.queueName,
                `No changes detected for event. before=${JSON.stringify(
                  data.before
                )}, after=${JSON.stringify(data.after)}`
              );
            }
          }
          break;
        case "delete":
          eventType = "token-attributes.deleted";
          if (data.before) {
            for (const key in changedMapping) {
              changed.push(key);
            }
          }
          break;
      }

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          token_id: data.after.token_id,
          contract: data.after.contract,
        },
        changed,
        data: result,
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

  public async addToQueue(events: TokenAttributeWebsocketEventsTriggerQueueJobPayload[]) {
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

export type EventInfo = {
  data: TokenAttributeWebsocketEventInfo;
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

export const tokenAttributeWebsocketEventsTriggerQueueJob =
  new TokenAttributeWebsocketEventsTriggerQueueJob();
