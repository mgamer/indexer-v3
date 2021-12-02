import cron from "node-cron";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { contractTypes } from "@/events/index";
import { addToEventsSyncCatchupQueue } from "@/jobs/events-sync";

// Every new block (approximately 15 seconds) there might be processes
// we want to run in order to stay up-to-date with the blockchain's
// current state. These processes are all to be triggered from this
// cron job.

if (config.doBackgroundWork) {
  cron.schedule("*/15 * * * * *", async () => {
    if (await acquireLock("catchup_lock", 10)) {
      logger.info("catchup_cron", "Catching up");

      try {
        // Sync events
        for (const contractType of contractTypes) {
          await addToEventsSyncCatchupQueue(contractType);
        }
      } catch (error) {
        logger.error("catchup_cron", `Failed to catch up: ${error}`);
      }
    }
  });
}
