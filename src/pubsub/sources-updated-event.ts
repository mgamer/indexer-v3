import { redis } from "@/common/redis";
import { events } from "@/pubsub/events";
import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";
import { config } from "@/config/index";

redis.subscribe(events.sourcesUpdated, (err) => {
  if (err) {
    logger.error(events.sourcesUpdated, `Failed to subscribe ${err.message}`);
  }
});

redis.on(events.sourcesUpdated, async (channel, message) => {
  await Sources.forceDataReload();
  logger.info(
    events.sourcesUpdated,
    `Reloaded sources from channel=${channel}, message=${message} on ${config.railwayStaticUrl}`
  );
});
