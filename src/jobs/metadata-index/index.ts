import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

// For filling collections/tokens metadata information, we rely
// on external services. For now, these are external APIs which
// retrieve the metadata from different well-known sources (eg.
// OpenSea, Rarible) and convert it into a standard format that
// is easy for the indexer to process.

const JOB_NAME = "metadata_index";

export const queue = new Queue(JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 60000,
    },
  },
});
new QueueScheduler(JOB_NAME, { connection: redis.duplicate() });

const addToQueue = async (contract: string, tokenIds: string[]) => {
  await queue.add(contract, { contract, tokenIds });
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/10 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${JOB_NAME}_queue_clean_lock`,
      10 * 60 - 5
    );
    if (lockAcquired) {
      // Clean up jobs older than 10 minutes
      await queue.clean(10 * 60 * 1000, 100000, "completed");
      await queue.clean(10 * 60 * 1000, 100000, "failed");
    }
  });
}

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  type Metadata = {
    skip?: boolean;
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
    token_id: string;
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

  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { contract, tokenIds } = job.data;

      try {
        if (!tokenIds.length) {
          // Skip if we don't need to index anything
          return;
        }

        // Batch request the metadata for the token ids
        let url = `${config.metadataApiBaseUrl}/${contract}/${tokenIds[0]}`;
        for (let i = 0; i < tokenIds.length; i++) {
          url += `${i === 0 ? "?" : "&"}token_ids=${tokenIds[i]}`;
        }

        logger.info(JOB_NAME, url);
        let { data } = await axios.get(url);

        // Ideally, the metadata APIs should return an error status
        // in case of failure. However, just in case, we explicitly
        // check here the presence of any `error` field.
        if ((data as any).error) {
          throw new Error((data as any).error);
        }

        for (const info of data as Metadata[]) {
          try {
            const queries: any[] = [];

            if (info.skip) {
              // If the token was marked as non-indexable we simply remove
              // any previous metadata it had from the tables (in order to
              // support the use case where we need to remove a token after
              // it was indexed a first time).

              queries.push(
                `
                  update "tokens" set
                    "name" = null,
                    "description" = null,
                    "image" = null,
                    "collection_id" = null
                  where "contract" = $/contract/
                    and "token_id" = $/tokenId/
                `,
                {
                  contract,
                  tokenId: info.token_id,
                }
              );

              queries.push(
                `
                  delete from "attributes"
                  where "contract" = $/contract/
                    and "token_id" = $/tokenId/
                `,
                {
                  contract,
                  tokenId: info.token_id,
                }
              );
            } else {
              if (!info.collection) {
                continue;
              }

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
                  id: info.collection.id,
                  name: info.collection.name,
                  description: info.collection.description,
                  image: info.collection.image,
                  royaltyBps: info.collection.royaltyBps,
                  royaltyRecipient:
                    info.collection.royaltyRecipient?.toLowerCase(),
                  community: info.collection.community,
                  contract: info.collection.contract,
                  // TODO: Set `token_id_range` as `null` instead of `numrange(null, null)`
                  // if the token id range information is missing from metadata. Right now,
                  // both `null` and `numrange(null, null)` are treated in the same way, as
                  // missing data, but we should make this more consistent.
                  startTokenId: info.collection.tokenRange?.[0],
                  endTokenId: info.collection.tokenRange?.[1],
                  filterableAttributeKeys: info.collection.filters,
                  sortableAttributeKeys: info.collection.sort,
                },
              });

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
                  tokenId: info.token_id,
                  collectionId: info.collection.id,
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
                  name: info.name || null,
                  description: info.description || null,
                  image: info.image || null,
                  collectionId: info.collection?.id || null,
                  contract,
                  tokenId: info.token_id,
                },
              });

              // Save token attributes
              const attributeValues: any[] = [];
              for (const { key, value, kind, rank } of info.attributes || []) {
                attributeValues.push({
                  collection_id: info.collection.id,
                  contract,
                  token_id: info.token_id,
                  key,
                  value,
                  // TODO: Defaulting to `string` should be done at the database level
                  kind: kind || "string",
                  // TODO: Defaulting to `1` should be done at the database level
                  rank: rank ? (rank === -1 ? null : rank) : 1,
                });
              }

              queries.push({
                query: `
                  delete from "attributes"
                  where "contract" = $/contract/
                    and "token_id" = $/tokenId/
                `,
                values: {
                  contract,
                  tokenId: info.token_id,
                },
              });

              if (attributeValues.length) {
                const columns = new pgp.helpers.ColumnSet(
                  [
                    "collection_id",
                    "contract",
                    "token_id",
                    "key",
                    "value",
                    "kind",
                    "rank",
                  ],
                  { table: "attributes" }
                );
                const values = pgp.helpers.values(attributeValues, columns);
                queries.push({
                  query: `
                    insert into "attributes" (
                      "collection_id",
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
            }

            if (queries.length) {
              await db.none(pgp.helpers.concat(queries));
            }
          } catch {
            // Ignore any errors
          }
        }
      } catch (error) {
        logger.error(
          JOB_NAME,
          `Failed to index (${contract}, ${tokenIds}): ${error}`
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

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule("*/10 * * * * *", async () => {
    const lockAcquired = await acquireLock("metadata_index_lock", 10 - 5);
    if (lockAcquired) {
      logger.info("metadata_index_cron", "Indexing missing metadata");

      try {
        const tokens: { contract: string; token_id: string }[] =
          await db.manyOrNone(
            `
              select
                "t"."contract",
                "t"."token_id"
              from "tokens" "t"
              where "t"."contract" in (
                select
                  "t"."contract"
                from "tokens" "t"
                where "t"."metadata_indexed" = false
                group by "t"."contract"
                having count(*) > 0
                limit 1
              )
                and "t"."metadata_indexed" = false
              limit 90
            `
          );

        if (tokens.length) {
          let current = 0;
          while (current < tokens.length) {
            const batchSize = 30;
            const batch = tokens.slice(current, current + batchSize);

            if (batch.length) {
              // Trigger metadata indexing for selected tokens
              await addToQueue(
                batch[0].contract,
                batch.map(({ token_id }) => token_id)
              );
            }

            current += batchSize;
          }

          // Optimistically mark the selected tokens as indexed and have
          // the underlying indexing jobs retry in case failures
          const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], {
            table: "tokens",
          });
          const values = pgp.helpers.values(tokens, columns);
          await db.none(`
            update "tokens" as "t" set
              "metadata_indexed" = true
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
