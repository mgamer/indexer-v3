/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaTopicHandler } from "kafka";

// Create a class implementing KafkaEventHandler for each event type
export class IndexerOrderEventsHandler implements KafkaTopicHandler {
  topicName = "indexer.public.order_events";

  async handle(payload: any): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`Handling ${this.topicName} event with payload:`, payload);
    // Implement logic here

    switch (payload.op) {
      case "c":
        // insert
        this.handleInsert(payload);
        break;
      case "u":
        // update
        this.handleUpdate();
        break;
      case "d":
        // delete
        this.handleDelete();
        break;
      default:
        logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
        break;
    }
  }

  async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    if (payload.after.kind === "new-order") {
      // trigger ask.created event

      await redisWebsocketPublisher.publish(
        "events",
        JSON.stringify({
          event: "ask.created.v2",
          tags: {
            contract: payload.after.contract,
          },
          data: payload.after,
        })
      );

      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "ask.updated.v2",
        tags: {
          contract: payload.after.contract,
        },
        data: payload.after,
      })
    );
    // all other cases, trigger ask.updated event
  }

  async handleUpdate(): Promise<void> {
    // probably do nothing here
  }

  async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
