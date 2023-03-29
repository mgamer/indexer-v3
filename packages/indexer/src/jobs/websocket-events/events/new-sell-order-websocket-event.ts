import { logger } from "@/common/logger";
import { redisWebsocketPublisher } from "@/common/redis";

export class NewSellOrderWebsocketEvent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async triggerEvent(data: any) {
    try {
      redisWebsocketPublisher.publish(
        "orders",
        JSON.stringify({
          event: "new-sell-order",
          data: data,
        })
      );
    } catch (e) {
      logger.error("top-bids-websocket-event", `Error triggering event. ${e}`);
    }
  }
}
