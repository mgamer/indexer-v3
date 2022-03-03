import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "token-updates-mint-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
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
        // TODO: For newly minted tokens we should also populate
        // various cached information (eg. floor sell, top buy),
        // otherwise the tokens might be missing from the result
        // of various APIs which depend on these cached values.

        // First, check the database for any matching collection
        const collection: { id: string } | null = await db.oneOrNone(
          `
            SELECT "c"."id" FROM "collections" "c"
            WHERE "c"."contract" = $/contract/
              AND "c"."token_id_range" @> $/tokenId/::NUMERIC(78, 0)
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const queries: any[] = [];
        if (collection) {
          // If the collection is readily available in the database then
          // all we needed to do is to associate it with the token. As a
          // safety measure, we also associate all the other tokens that
          // match it and have no collection yet.
          queries.push({
            query: `
              WITH "x" AS (
                SELECT
                  "c"."contract",
                  "c"."token_id_range"
                FROM "collections" "c"
                WHERE "c"."id" = $/collectionId/
              ),
              "y" AS (
                UPDATE "tokens" AS "t" SET
                  "collection_id" = $/collectionId/,
                  "updated_at" = now()
                FROM "x"
                WHERE "t"."contract" = "x"."contract"
                  AND "t"."token_id" <@ "x"."token_id_range"
                  AND "t"."collection_id" IS NULL
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = "token_count" + (SELECT COUNT(*) FROM "y")
              WHERE "id" = $/collectionId/
            `,
            values: {
              contract: toBuffer(contract),
              tokenId,
              collectionId: collection.id,
            },
          });
        } else {
          // Otherwise, we have to fetch the collection metadata
          // and definition from the upstream service.
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

          const tokenIdRange = collection.tokenIdRange
            ? `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`
            : `'(,)'::numrange`;
          queries.push({
            query: `
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
            values: {
              id: collection.id,
              slug: collection.slug,
              name: collection.name,
              community: collection.community,
              metadata: collection.metadata,
              royalties: collection.royalties,
              contract: toBuffer(collection.contract),
              tokenIdRange,
              tokenSetId: collection.tokenSetId,
            },
          });

          // Since this is the first time we run into this collection,
          // we update all tokens that match its token definition.
          queries.push({
            query: `
              WITH "x" AS (
                UPDATE "tokens" SET "collection_id" = $/collectionId/
                WHERE "contract" = $/contract/
                  AND "token_id" <@ $/tokenIdRange:raw/
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = (SELECT COUNT(*) FROM "x")
              WHERE "id" = $/collectionId/
            `,
            values: {
              contract: toBuffer(collection.contract),
              tokenIdRange,
              collectionId: collection.id,
            },
          });
        }

        if (queries.length) {
          await db.none(pgp.helpers.concat(queries));
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
