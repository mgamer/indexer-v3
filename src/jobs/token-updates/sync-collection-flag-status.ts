/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Collections } from "@/models/collections";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  PendingFlagStatusSyncToken,
  PendingFlagStatusSyncTokens,
} from "@/models/pending-flag-status-sync-tokens";
import * as syncTokensFlagStatus from "@/jobs/token-updates/sync-tokens-flag-status";

const QUEUE_NAME = "sync-collection-flag-status";
const LOWEST_FLOOR_ASK_QUERY_LIMIT = 20;
const RECENT_TRANSFERS_QUERY_DAYS_BACK = 14;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collectionId, backfill } = job.data;

      logger.info(
        QUEUE_NAME,
        `Sync tokens flag status sync for ${collectionId}. backfill:${backfill}`
      );

      const collection = await Collections.getById(collectionId);

      // Don't check collections with too many tokens
      if (!collection || collection.tokenCount > config.maxItemsPerBid) {
        return;
      }

      const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);

      // Don't check if there is an existing sync in progress
      if ((await pendingFlagStatusSyncTokensQueue.count()) > 0) {
        await syncTokensFlagStatus.addToQueue(collectionId, collection.contract);

        return;
      }

      const pendingSyncFlagStatusTokens = [];

      if (backfill) {
        const tokensQuery = `
            SELECT token_id, is_flagged
            FROM tokens
            WHERE collection_id = $/collectionId/
          `;

        const tokens = await idb.manyOrNone(tokensQuery, {
          collectionId,
        });

        pendingSyncFlagStatusTokens.push(
          ...tokens.map((r) => ({
            tokenId: r.token_id,
            isFlagged: r.is_flagged,
          }))
        );
      } else {
        const flaggedTokensQuery = `
            SELECT token_id
            FROM tokens
            WHERE collection_id = $/collectionId/
            AND is_flagged = 1
          `;

        const flaggedTokens = await idb.manyOrNone(flaggedTokensQuery, {
          collectionId,
        });

        pendingSyncFlagStatusTokens.push(
          ...flaggedTokens.map((r) => ({
            tokenId: r.token_id,
            isFlagged: 1,
          }))
        );

        const lowestFloorAskQuery = `
        SELECT token_id
        FROM tokens
        WHERE collection_id = $/collectionId/
        AND floor_sell_value IS NOT NULL
        ORDER BY floor_sell_value ASC
        LIMIT $/limit/
      `;

        const lowestFloorAskTokens = await idb.manyOrNone(lowestFloorAskQuery, {
          collectionId,
          limit: LOWEST_FLOOR_ASK_QUERY_LIMIT,
        });

        pendingSyncFlagStatusTokens.push(
          ...lowestFloorAskTokens.map((r) => ({
            tokenId: r.token_id,
            isFlagged: 0,
          }))
        );

        let tokensRangeFilter = "";

        const values = {
          daysBack: RECENT_TRANSFERS_QUERY_DAYS_BACK,
        };

        if (collectionId.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
          const [contract, startTokenId, endTokenId] = collectionId.split(":");

          (values as any).contract = toBuffer(contract);
          (values as any).startTokenId = startTokenId;
          (values as any).endTokenId = endTokenId;

          tokensRangeFilter = `
              AND nft_transfer_events.token_id >= $/startTokenId/
              AND nft_transfer_events.token_id <= $/endTokenId/
            `;
        } else {
          (values as any).contract = toBuffer(collectionId);
        }

        const recentTransfersQuery = `
        SELECT
            DISTINCT ON (nft_transfer_events.token_id) nft_transfer_events.token_id,
            nft_transfer_events.timestamp
        FROM nft_transfer_events
        WHERE nft_transfer_events.address = $/contract/
        AND nft_transfer_events.timestamp > extract(epoch from now() - interval '$/daysBack/ days')
        ${tokensRangeFilter}
        ORDER BY nft_transfer_events.token_id, nft_transfer_events.timestamp DESC
      `;

        const recentTransfersTokens = await idb.manyOrNone(recentTransfersQuery, values);

        pendingSyncFlagStatusTokens.push(
          ...recentTransfersTokens.map((r) => ({
            tokenId: r.token_id,
            isFlagged: 0,
          }))
        );
      }

      // Add the tokens to the list
      const pendingCount = await pendingFlagStatusSyncTokensQueue.add(
        pendingSyncFlagStatusTokens.map(
          (r) =>
            ({
              collectionId: collectionId,
              contract: collection.contract,
              tokenId: r.tokenId,
              isFlagged: r.isFlagged,
            } as PendingFlagStatusSyncToken)
        )
      );

      logger.info(
        QUEUE_NAME,
        `There are ${pendingCount} tokens pending flag status sync for ${collectionId}`
      );

      await syncTokensFlagStatus.addToQueue(collectionId, collection.contract);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collectionId: string, backfill = false) => {
  await queue.add(randomUUID(), { collectionId, backfill });
};
