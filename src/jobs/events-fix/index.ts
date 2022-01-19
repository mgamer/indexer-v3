import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { contractKinds, getContractInfo } from "@/events/index";
import { addToEventsSyncBackfillQueue } from "@/jobs/events-sync";

// Since we're syncing events up to the head of the blockchain
// we might get some results that belong to dropped/orphaned
// blocks. For this reason, we have to continuously check
// fetched events to make sure they're in the canonical chain.
// We do this by comparing the ingested block hashes against
// the upstream block hashes and reverting in case there is
// any mismatch. For now, this check is only done for events
// synced from the base network (eg. via `baseProvider`).

if (config.doBackgroundWork) {
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("events_fix_lock", 55);
    if (lockAcquired) {
      logger.info("events_fix_cron", "Checking events");

      try {
        // Retrieve the last local block hashes from all event tables
        const localBlocks: { block: number; blockHash: string }[] =
          await db.manyOrNone(
            `
              (select distinct
                "block",
                "block_hash" as "blockHash"
              from "nft_transfer_events"
              order by "block" desc
              limit $/limit/)

              union

              (select distinct
                "block",
                "block_hash" as "blockHash"
              from "ft_transfer_events"
              order by "block" desc
              limit $/limit/)

              union

              (select distinct
                "block",
                "block_hash" as "blockHash"
              from "cancel_events"
              order by "block" desc
              limit $/limit/)

              union

              (select distinct
                "block",
                "block_hash" as "blockHash"
              from "fill_events"
              order by "block" desc
              limit $/limit/)
            `,
            { limit: 30 }
          );

        const wrongBlocks = new Map<number, string>();
        try {
          for (const { block, blockHash } of localBlocks) {
            const upstreamBlockHash = (await baseProvider.getBlock(block)).hash;
            if (blockHash !== upstreamBlockHash) {
              logger.info(
                "events_fix_cron",
                `Detected wrong block ${block} with hash ${blockHash}`
              );

              wrongBlocks.set(block, blockHash);
            }
          }
        } catch (error) {
          logger.error(
            "events_fix_cron",
            `Failed to retrieve block hashes: ${error}`
          );
        }

        for (const [block, blockHash] of wrongBlocks.entries()) {
          for (const contractKind of contractKinds) {
            try {
              const contractInfo = getContractInfo(contractKind);

              // Fix wrong event entries
              await contractInfo.fixCallback(blockHash);

              // Resync
              const contracts: string[] = await db
                .manyOrNone(
                  `
                    select
                      "c"."address"
                    from "contracts" "c"
                    where "c"."kind" = $/contractKind/
                  `,
                  { contractKind }
                )
                .then((result) => result.map(({ address }) => address));

              await addToEventsSyncBackfillQueue(
                contractKind,
                contracts,
                block,
                block,
                { prioritized: true }
              );
            } catch (error) {
              logger.error(
                "events_fix_cron",
                `Failed to check events for kind ${contractKind}: ${error}`
              );
            }
          }
        }
      } catch (error) {
        logger.error("events_fix_cron", `Failed to fix events: ${error}`);
      }
    }
  });
}
