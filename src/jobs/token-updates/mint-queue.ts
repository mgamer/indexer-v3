import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis, redlock } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "token-updates-mint-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId } = job.data as MintInfo;

      try {
        // First, check the database for any matching collection
        const collection: { id: string } | null = await db.oneOrNone(
          `
            SELECT "c"."id" FROM "collections" "c"
            WHERE "c"."contract" = $/contract/
              AND "c"."token_id_range" @> $/tokenId/::numeric(78, 0)
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const updateTokenCollection = async (collectionId: string) =>
          db.none(
            `
              UPDATE "tokens" SET
                "collection_id" = $/collectionId/,
                "updated_at" = now()
              WHERE "contract" = $/contract/
                AND "token_id" = $/tokenId/
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              collectionId,
            }
          );

        if (collection) {
          // If the collection is readily available in the database, use it
          await updateTokenCollection(collection.id);
        } else {
          // Otherwise, fetch the collection metadata from upstream
          const url = `${config.metadataApiBaseUrl}/v3/${network}/collection?contract=${contract}&tokenId=${tokenId}`;

          const { data } = await axios.get(url);
          const collection: {
            id: string;
            slug: string;
            name: string;
            community: string | null;
            metadata: any;
            royalties: any;
            contract: string;
            tokenIdRange: [string, string] | null;
            tokenSetId: string;
          } = (data as any).collection;

          await db.none(
            `
              INSERT INTO "collections" (
                "id",
                "slug",
                "name",
                "community",
                "metadata",
                "royalties",
                "contract",
                "token_id_range",
                "token_set_id",
                "created_at",
                "updated_at"
              ) VALUES (
                $/id/,
                $/slug/,
                $/name/,
                $/community/,
                $/metadata:json/,
                $/royalties:json/,
                $/contract/,
                $/tokenIdRange:raw/,
                $/tokenSetId/,
                now(),
                now()
              ) ON CONFLICT DO NOTHING
            `,
            {
              id: collection.id,
              slug: collection.slug,
              name: collection.name,
              community: collection.community,
              metadata: collection.metadata,
              royalties: collection.royalties,
              contract: toBuffer(collection.contract),
              tokenIdRange: collection.tokenIdRange
                ? `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`
                : `'(,)'::numrange`,
              tokenSetId: collection.tokenSetId,
            }
          );

          await updateTokenCollection(collection.id);
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire([`${QUEUE_NAME}-queue-clean-lock`], (60 - 5) * 1000)
        .then(async () => {
          // Clean up jobs older than 10 minutes
          await queue.clean(10 * 60 * 1000, 10000, "completed");
          await queue.clean(10 * 60 * 1000, 10000, "failed");
        })
        .catch(() => {})
  );
}

export type MintInfo = {
  contract: string;
  tokenId: string;
};

export const addToQueue = async (mintInfos: MintInfo[]) => {
  await queue.addBulk(
    mintInfos.map((mintInfo) => ({
      name: `${mintInfo.contract}-${mintInfo.tokenId}`,
      data: mintInfo,
    }))
  );
};
