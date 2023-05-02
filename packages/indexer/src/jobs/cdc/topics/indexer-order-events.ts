/* eslint-disable @typescript-eslint/no-explicit-any */
import { redisWebsocketPublisher } from "@/common/redis";
import { KafkaEventHandler } from ".";

// Create a class implementing KafkaEventHandler for each event type
export class IndexerOrderEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.order_events";

  protected async handleInsert(payload: any): Promise<void> {
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

  protected async handleUpdate(payload: any): Promise<void> {
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
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }

  async enrichData(data: any): Promise<any> {
    // get data from postgresql and do the parsing / event enrichment here and return the enriched data
    return data;
  }
}
