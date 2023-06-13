import { logger } from "@/common/logger";
import { redisWebsocketPublisher } from "./redis";

export interface WebsocketMessage {
  published_at?: number;
  event: string;
  tags: {
    [key: string]: string;
  };
  changed?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  offset?: string;
}

export const publishWebsocketEvent = async (message: WebsocketMessage): Promise<void> => {
  message.published_at = Date.now();
  await redisWebsocketPublisher.publish("events", JSON.stringify(message));
  await addOffsetToSortedSet(message, message.offset);
};

export const addOffsetToSortedSet = async (
  event: WebsocketMessage,
  offset?: string
): Promise<void> => {
  try {
    if (!offset) {
      return;
    }
    const stringOffset = String(offset);
    const stringEvent = String(event.event);

    await redisWebsocketPublisher.zadd(
      "offsets",
      `${stringOffset}-${stringEvent}`,
      String(Date.now())
    );
  } catch (error) {
    logger.error("add-offset-to-sorted-set", "Failed to add offset to sorted set: " + error);
  }
};
