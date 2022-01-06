import cron from "node-cron";

import { logger } from "@/common/logger";
import { altProvider } from "@/common/provider";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { db, pgp } from "@/common/db";

// Unfortunately, on-chain events only include the block they
// were triggered at but not the associated timestamp. However,
// to have a good UX, we want to return the timestamp as well
// in various APIs. In order to do that, we must explicitly
// fetch the timestamp of each block referenced in the event
// tables. For now, we're only interested in blocks that are
// referenced by NFT transfer events.

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  cron.schedule("*/10 * * * * *", async () => {
    const lockAcquired = await acquireLock("blocks_fetch_lock", 5);
    if (lockAcquired) {
      logger.info("blocks_fetch_cron", "Fetching blocks");

      try {
        const blocks: { block: number }[] = await db.manyOrNone(
          `
            select
              "nte"."block"
            from "nft_transfer_events" "nte"
            where not exists(
              select from "blocks" "b" where "b"."block" = "nte"."block"
            )
            limit $/limit/
          `,
          { limit: 20 }
        );

        let blockValues: any[] = [];
        for (const { block } of blocks) {
          const timestamp = (await altProvider.getBlock(block)).timestamp;
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
      } catch (error) {
        logger.error("blocks_fetch_cron", `Failed to fetch blocks: ${error}`);
      }
    }
  });
}
