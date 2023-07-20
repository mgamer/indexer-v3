import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
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
              if (
                data.before[key as keyof TokenAttributeInfo] !==
                data.after[key as keyof TokenAttributeInfo]
              ) {
                changed.push(changedMapping[key as keyof typeof changedMapping]);
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
        data: {
          token: {
            contract: data.after.contract,
            tokenId: data.after.token_id,
          },
          collection: {
            id: data.after.collection_id,
          },
          key: data.after.key,
          value: data.after.value,
          createdAt: data.after.created_at,
          updatedAt: data.after.updated_at,
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
  collection_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export type TokenAttributeWebsocketEventInfo = {
  before: TokenAttributeInfo;
  after: TokenAttributeInfo;
  trigger: "insert" | "update" | "delete";
};

export const tokenAttributeWebsocketEventsTriggerQueueJob =
  new TokenAttributeWebsocketEventsTriggerQueueJob();
