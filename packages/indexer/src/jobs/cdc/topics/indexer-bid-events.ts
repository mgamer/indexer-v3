/* eslint-disable @typescript-eslint/no-explicit-any */
import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaEventHandler } from ".";

// Create a class implementing KafkaEventHandler for each event type
export class IndexerBidEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.bid_events";
  queueName = "indexer-bid-events";
  queue = null;
  worker = null;

  protected async handleInsert(payload: any): Promise<void> {
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

  protected async handleUpdate(payload: any): Promise<void> {
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

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
