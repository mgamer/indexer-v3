import cron from "node-cron";

import "@/jobs/user-received-bids/add-user-received-bids";
import "@/jobs/user-received-bids/clean-user-received-bids";

import { acquireLock } from "@/common/redis";
import { logger } from "@/common/logger";
import * as cleanUserReceivedBids from "@/jobs/user-received-bids/clean-user-received-bids";
import { config } from "@/config/index";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("* * * * *", async () => {
    if (await acquireLock("clean-user-received-bids")) {
      logger.info(cleanUserReceivedBids.queue.name, "Clean user received bids");

      try {
        await cleanUserReceivedBids.addToQueue();
      } catch (error) {
        logger.error(
          cleanUserReceivedBids.queue.name,
          `Failed to clean user received bids: ${error}`
        );
      }
    }
  });
}
