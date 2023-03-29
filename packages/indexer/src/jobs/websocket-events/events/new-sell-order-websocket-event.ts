import { logger } from "@/common/logger";
import { redisWebsocketPublisher } from "@/common/redis";

export class NewSellOrderWebsocketEvent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async triggerEvent(data: any) {
    try {
      logger.info(
        "top-bids-websocket-event",
        `Triggering event. orderId=${data.orderId}, tokenSetId=${data.token_set_id}`
      );

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
