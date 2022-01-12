import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

// For filling collections/tokens metadata information, we rely
// on external services. For now, these are centralized APIs
// that provide the metadata in a standard custom format that
// is easy for the indexer to process.

const JOB_NAME = "metadata_index";

const queue = new Queue(JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 120000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(JOB_NAME, { connection: redis.duplicate() });

const addToQueue = async (tokens: { contract: string; tokenId: string }[]) => {
  const jobs: any[] = [];
  for (const token of tokens) {
    jobs.push({
      name: token.contract,
      data: token,
    });
  }
  await queue.addBulk(jobs);
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { contract, tokenId } = job.data;

      type Metadata = {
        collection: {
          id: string;
          name: string;
          description: string;
          image: string;
          royaltyBps: number;
          royaltyRecipient?: string;
          community: string;
          contract?: string;
          tokenRange?: [string, string];
          filters?: any;
          sort?: any;
        };
        name: string;
        description: string;
        image: string;
        attributes: {
          key: string;
          value: string;
          kind?: "number" | "string" | "date" | "range";
          rank?: number;
        }[];
      };

      try {
        const { data }: { data: Metadata } = await axios.get(
          `${config.metadataApiBaseUrl}/${contract}/${tokenId}`
        );

        const queries: any[] = [];

        // Save collection high-level metadata
        queries.push({
          query: `
            insert into "collections" (
              "id",
              "name",
              "description",
              "image",
              "royalty_bps",
              "royalty_recipient",
              "community",
              "contract",
              "token_id_range",
              "filterable_attribute_keys",
              "sortable_attribute_keys"
            ) values (
              $/id/,
              $/name/,
              $/description/,
              $/image/,
              $/royaltyBps/,
              $/royaltyRecipient/,
              $/community/,
              $/contract/,
              numrange($/startTokenId/, $/endTokenId/),
              $/filterableAttributeKeys:json/,
              $/sortableAttributeKeys:json/
            ) on conflict ("id") do
            update set
              "name" = $/name/,
              "description" = $/description/,
              "image" = $/image/,
              "royalty_bps" = $/royaltyBps/,
              "royalty_recipient" = $/royaltyRecipient/,
              "community" = $/community/,
              "contract" = $/contract/,
              "token_id_range" = numrange($/startTokenId/, $/endTokenId/, '[]'),
              "filterable_attribute_keys" = $/filterableAttributeKeys:json/,
              "sortable_attribute_keys" = $/sortableAttributeKeys:json/
          `,
          values: {
            id: data.collection.id,
            name: data.collection.name,
            description: data.collection.description,
            image: data.collection.image,
            royaltyBps: data.collection.royaltyBps,
            royaltyRecipient: data.collection.royaltyRecipient,
            community: data.collection.community,
            contract: data.collection.contract,
            // TODO: Set `token_id_range` as `null` instead of `numrange(null, null)`
            // if the token id range information is missing from metadata. Right now,
            // both `null` and `numrange(null, null)` are treated as missing data,
            // but we should make this more consistent.
            startTokenId: data.collection.tokenRange?.[0],
            endTokenId: data.collection.tokenRange?.[1],
            filterableAttributeKeys: data.collection.filters,
            sortableAttributeKeys: data.collection.sort,
          },
        });

        // Save token high-level metadata
        queries.push({
          query: `
            update "tokens" set
              "name" = $/name/,
              "description" = $/description/,
              "image" = $/image/,
              "collection_id" = $/collectionId/
            where "contract" = $/contract/
              and "token_id" = $/tokenId/
          `,
          values: {
            name: data.name,
            description: data.description,
            image: data.image,
            collectionId: data.collection.id,
            contract,
            tokenId,
          },
        });

        // Save token attribute metadata
        const attributeValues: any[] = [];
        for (const { key, value, kind, rank } of data.attributes) {
          attributeValues.push({
            contract,
            token_id: tokenId,
            key,
            value,
            // TODO: Defaulting to `string` should be done at the database level
            kind: kind || "string",
            // TODO: Defaulting to `1` should be done at the database level
            rank: rank ? (rank === -1 ? null : rank) : 1,
          });
        }
        if (attributeValues.length) {
          const columns = new pgp.helpers.ColumnSet(
            ["contract", "token_id", "key", "value", "kind", "rank"],
            { table: "attributes" }
          );
          const values = pgp.helpers.values(attributeValues, columns);
          queries.push({
            query: `
              delete from "attributes"
              where "contract" = $/contract/
                and "token_id" = $/tokenId/
            `,
            values: {
              contract,
              tokenId,
            },
          });
          queries.push({
            query: `
              insert into "attributes" (
                "contract",
                "token_id",
                "key",
                "value",
                "kind",
                "rank"
              ) values ${values}
              on conflict do nothing
            `,
          });
        }

        // Update collection-wide token sets
        queries.push({
          query: `
            insert into "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            )
            (
              select
                "id",
                $/contract/,
                $/tokenId/
              from "token_sets"
              where "collection_id" = $/collectionId/
            )
            on conflict do nothing
          `,
          values: {
            contract,
            tokenId,
            collectionId: data.collection.id,
          },
        });

        if (queries.length) {
          await db.none(pgp.helpers.concat(queries));
        }
      } catch (error) {
        logger.error(
          JOB_NAME,
          `Failed to index (${contract}, ${tokenId}): ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(JOB_NAME, `Worker errored: ${error}`);
  });
}

// Metadata indexing should be a one-time process where a cron
// job checks for tokens within the database that are not indexed,
// fethches and updates the metadata and then marks them as indexed.
// In cases where tokens need to be reindexed for some reasons (eg.
// metadata updates), they can simply be marked as not indexed and
// the metadata indexing process will take care of reindexing them
// atomically (eg. deleting old metadata and adding new one).

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  cron.schedule("*/30 * * * * *", async () => {
    const lockAcquired = await acquireLock("metadata_index_lock", 25);
    if (lockAcquired) {
      logger.info("metadata_index_cron", "Indexing missing metadata");

      try {
        // Retrieve tokens that don't have metadata indexed
        const tokens: { contract: string; tokenId: string }[] =
          await db.manyOrNone(
            `
              select
                "contract",
                "token_id" as "tokenId"
              from "tokens"
              where not "metadata_indexed"
              limit $/limit/
            `,
            { limit: 50 }
          );

        if (tokens.length) {
          // Trigger metadata indexing for selected tokens
          await addToQueue(tokens);

          // Optimistically mark the selected tokens as indexed. The
          // underlying indexing job has a retry mechanism so it's
          // quite unlikely it will fail to index in all attempts.

          // TODO: Since the optimistic approach of marking tokens
          // as indexed and then triggering a metadata fetch might
          // fail in quite a few cases, we should have a cron job
          // that periodically checks for tokens marked as indexed
          // that don't actually have metadata and retry indexing.
          const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], {
            table: "tokens",
          });
          const values = pgp.helpers.values(
            tokens.map((t) => ({
              contract: t.contract,
              token_id: t.tokenId,
            })),
            columns
          );
          await db.none(`
            update "tokens" as "t" set "metadata_indexed" = true
            from (values ${values}) as "i"("contract", "token_id")
            where "t"."contract" = "i"."contract"::text
              and "t"."token_id" = "i"."token_id"::numeric(78, 0)
          `);
        }
      } catch (error) {
        logger.error(
          "metadata_index_cron",
          `Failed to trigger metadata indexing: ${error}`
        );
      }
    }
  });
}
