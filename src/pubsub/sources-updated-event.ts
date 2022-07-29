import { channels } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

export class SourcesUpdatedEvent {
  public static async handleEvent(message: string) {
    await Sources.forceDataReload();
    logger.info(
      channels.sourcesUpdated,
      `Reloaded sources message=${message} on ${config.railwayStaticUrl}`
    );
  }
}
