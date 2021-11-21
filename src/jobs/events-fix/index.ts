import cron from "node-cron";

import { db } from "@common/db";
import { logger } from "@common/logger";
import { baseProvider } from "@common/provider";
import { acquireLock, redis, releaseLock } from "@common/redis";
import { config } from "@config";
import { eventTypes, getEventInfo } from "@events/index";
import { addToBackfillQueue } from "@jobs/events-sync";

if (config.doBackgroundWork) {
  // Since we're syncing events up to the head of the blockchain
  // we might get some results that belong to dropped/orphaned
  // blocks. For this reason, we have to continuously check
  // fetched events to make sure they're in the canonical chain.
  // We do this by comparing the ingested block hashes against
  // the upstream block hashes and reverting in case there is
  // any mismatch.

  // Warning: for now, this check is only done for events synced
  // from the base network (eg. via `baseProvider`)

  cron.schedule("*/1 * * * *", async () => {
    if (await acquireLock("events_fix_lock", 55)) {
      logger.info("events_fix_cron", "Checking events");

      const numBlocksToCheck = 10;

      // Retrieve the last local block hashes from all event tables
      const localBlocks: { block: number; blockHash: string }[] =
        await db.manyOrNone(
          `
            select distinct
              "block",
              "block_hash" as "blockHash"
            from "transfer_events"
            order by "block" desc
            limit $/limit/
          `,
          { limit: numBlocksToCheck }
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
        logger.error("events_fix_cron", "Failed to retrieve block hashes");
      }

      for (const [block, blockHash] of wrongBlocks.entries()) {
        for (const eventType of eventTypes) {
          // For now, skip fixing events that are not synced from
          // the base network (eg. orderbook events)
          const eventInfo = getEventInfo(eventType);
          if (
            eventInfo.provider._network.chainId !==
            baseProvider._network.chainId
          ) {
            continue;
          }

          // Fix wrong event entries
          await eventInfo.fixCallback(blockHash);

          // Resync
          const contracts = await redis.smembers(`${eventType}_contracts`);
          await addToBackfillQueue(eventType, contracts, block, block);
        }
      }

      await releaseLock("events_fix_lock");
    }
  });
}
