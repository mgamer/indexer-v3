/* eslint-disable @typescript-eslint/no-explicit-any */

import { IndexerOrderEventsHandler } from "./indexer-order-events";
import { IndexerBidEventsHandler } from "./indexer-bid-events";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-ft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-ft-balances";
import { IndexerTransferEventsHandler } from "./indexer-ft-transfer-events";
import { logger } from "@/common/logger";
import { producer } from "..";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  async handle(payload: any): Promise<void> {
    try {
      switch (payload.op) {
        case "c":
          this.handleInsert(payload);
          break;
        case "u":
          this.handleUpdate(payload);
          break;
        case "d":
          this.handleDelete();
          break;
        default:
          logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
          break;
      }
    } catch (error) {
      // if the topic is an error topic, don't send it to the error topic again and cause an infinite loop
      // send it to the dead letter topic instead

      let topicToSendTo = `${this.topicName}-error`;
      if (this.topicName.includes("error")) {
        topicToSendTo = `${this.topicName}-dead-letter`;
      }

      payload.retryCount += 1;
      if (payload.retryCount > this.maxRetries) {
        // send to dead letter topic
        topicToSendTo = `${this.topicName}-dead-letter`;
      }

      logger.error(
        this.topicName,
        `Error handling event: ${error}, topicToSendTo=${topicToSendTo}`
      );

      producer.send({
        topic: topicToSendTo,
        messages: [
          {
            value: JSON.stringify({
              error: JSON.stringify(error),
              payload,
            }),
          },
        ],
      });
    }
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name and a dead letter topic name
    return [this.topicName, `${this.topicName}-error`];
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
