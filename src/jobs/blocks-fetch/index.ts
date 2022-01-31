import cron from "node-cron";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { db, pgp } from "@/common/db";

// Unfortunately, on-chain events only include the block they were
// triggered at but not the associated timestamp. However, to have
// a good UX, in different APIs we want to return the timestamp as
// well. In order to do that, we must have a separate process that
// deals with fetching the timestamps of blocks.

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/15 * * * * *", async () => {
    const lockAcquired = await acquireLock("blocks_fetch_lock", 10);
    if (lockAcquired) {
      logger.info("blocks_fetch", "Fetching blocks");

      // TODO: Have a process to backfill previous blocks
      try {
        const currentBlock = await baseProvider.getBlockNumber();

        let lastBlock = Number(await redis.get("blocks_fetch_last_block"));
        if (lastBlock === 0) {
          lastBlock = currentBlock - 1;
        }

        if (lastBlock < currentBlock) {
          let blockValues: any[] = [];
          for (let block = lastBlock + 1; block <= currentBlock; block++) {
            const timestamp = (await baseProvider.getBlock(block)).timestamp;
            blockValues.push({
              block,
              timestamp,
            });
          }

          if (blockValues.length) {
            const columns = new pgp.helpers.ColumnSet(["block", "timestamp"], {
              table: "blocks",
            });
            const values = pgp.helpers.values(blockValues, columns);

            await db.none(`
              insert into "blocks" (
                "block",
                "timestamp"
              ) values ${values}
              on conflict do nothing
            `);
          }

          await redis.set("blocks_fetch_last_block", currentBlock);
        }
      } catch (error) {
        logger.error("blocks_fetch", `Failed to fetch blocks: ${error}`);
      }
    }
  });
}
