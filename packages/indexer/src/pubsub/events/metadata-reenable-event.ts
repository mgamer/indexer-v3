import { logger } from "@/common/logger";
import { MetadataStatus } from "@/models/metadata-status";
import { Channel } from "@/pubsub/channels";

export class MetadataReenabledEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    for (const id of parsedMessage.ids) {
      delete MetadataStatus.disabled[id];
    }

    logger.info(
      Channel.MetadataReenabled,
      JSON.stringify({
        message: `Reenabled collection metadata`,
        ids: parsedMessage.ids,
      })
    );
  }
}
