/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaTopicHandler } from "kafka";

// Create a class implementing KafkaEventHandler for each event type
export class IndexerBidEventsHandler implements KafkaTopicHandler {
  topicName = "indexer.public.bid_events";

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
        this.handleUpdate(payload);
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
          event: "bid.created.v2",
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
        event: "bid.updated.v2",
        tags: {
          contract: payload.after.contract,
        },
        data: payload.after,
      })
    );
  }

  async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await redisWebsocketPublisher.publish(
      "events",
      JSON.stringify({
        event: "bid.updated.v2",
        tags: {},
        data: payload.after,
      })
    );
  }

  async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
