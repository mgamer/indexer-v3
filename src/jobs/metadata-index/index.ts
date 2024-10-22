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
    attempts: 8,
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
      setId?: string;
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

      // Keep a list of all tokens that were properly indexed
      const handledTokenIds = new Set<string>();
      try {
        if (!tokenIds.length) {
          // Skip if we don't need to index anything
          return;
        }

        // Batch request the metadata for the token ids
        let url = `${config.metadataApiBaseUrl}/${contract}`;
        for (let i = 0; i < tokenIds.length; i++) {
          url += `${i === 0 ? "?" : "&"}token_ids=${tokenIds[i]}`;
        }

        logger.info(JOB_NAME, `Requesting ${url}`);
        const { data } = await axios.get(url);

        // Ideally, the metadata APIs should return an error status
        // in case of failure. However, just in case, we explicitly
        // check here the presence of any `error` field.
        if ((data as any).error) {
          throw new Error(JSON.stringify((data as any).error));
        }

        for (const info of data as Metadata[]) {
          try {
            const queries: any[] = [];

            if (info.skip) {
              // If the token was marked as non-indexable we simply remove
              // any previous metadata it had from the tables (in order to
              // support the use case where we need to remove a token after
              // it was indexed a first time).

              queries.push({
                query: `
                  update "tokens" set
                    "name" = null,
                    "description" = null,
                    "image" = null,
                    "collection_id" = null
                  where "contract" = $/contract/
                    and "token_id" = $/tokenId/
                `,
                values: {
                  contract,
                  tokenId: info.token_id,
                },
              });

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
            } else {
              if (!info.collection) {
                // Skip (and retry) tokens for which data is missing
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
                    "token_set_id",
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
                    $/tokenSetId/,
                    $/filterableAttributeKeys:json/,
                    $/sortableAttributeKeys:json/
                  ) on conflict do nothing
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
                  tokenSetId: info.collection.setId,
                  filterableAttributeKeys: info.collection.filters,
                  sortableAttributeKeys: info.collection.sort,
                },
              });

              if (info.collection.setId) {
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
                        "ts"."id",
                        $/contract/,
                        $/tokenId/
                      from "token_sets" "ts"
                      where "ts"."id" = $/tokenSetId/
                    )
                    on conflict do nothing
                  `,
                  values: {
                    contract,
                    tokenId: info.token_id,
                    tokenSetId: info.collection.setId,
                  },
                });
              }

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
          } catch (error) {
            logger.error(JOB_NAME, `Internal failure indexing token: ${error}`);
            continue;
          }

          // If everything went well mark the token as handled
          handledTokenIds.add(info.token_id);
        }

        const notHandledTokenIds = (tokenIds as string[]).filter(
          (tokenId) => !handledTokenIds.has(tokenId)
        );
        if (notHandledTokenIds.length) {
          // If we have tokens that failed the indexing process
          // then we should only retry those particular tokens
          await job.update({
            contract,
            tokenIds: notHandledTokenIds,
          });

          logger.info(
            JOB_NAME,
            `Retrying (${contract}, ${notHandledTokenIds})`
          );
          throw new Error("Missing tokens");
        }
      } catch (error) {
        logger.error(JOB_NAME, `Metadata indexing failure: ${error}`);
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
  cron.schedule("*/5 * * * * *", async () => {
    const lockAcquired = await acquireLock("metadata_index_lock", 3);
    if (lockAcquired) {
      logger.info("metadata_index_cron", "Indexing missing metadata");

      try {
        const tokenInfos: { contract: string; token_ids: string[] }[] =
          await db.manyOrNone(
            `
              select
                "t"."contract",
                array(
                  select
                    "token_id"
                  from "tokens"
                  where "contract" = "t"."contract"
                    and "metadata_indexed" = false
                  limit 20
                )::text[] as "token_ids"
              from "tokens" "t"
              where "t"."metadata_indexed" = false
              group by "t"."contract"
              having count(*) > 0
              order by count(*) desc
              limit 3
            `
          );

        for (const { contract, token_ids } of tokenInfos) {
          let current = 0;
          while (current < token_ids.length) {
            const batchSize = 20;
            const batch = token_ids.slice(current, current + batchSize);

            if (batch.length) {
              // Trigger metadata indexing for selected tokens
              await addToQueue(contract, batch);
            }

            current += batchSize;
          }

          // Optimistically mark the selected tokens as indexed and have
          // the underlying indexing jobs retry in case failures
          const columns = new pgp.helpers.ColumnSet(["contract", "token_id"], {
            table: "tokens",
          });
          const values = pgp.helpers.values(
            token_ids.map((token_id) => ({ contract, token_id })),
            columns
          );
          await db.none(
            `
              update "tokens" as "t" set
                "metadata_indexed" = true
              from (values ${values}) as "i"("contract", "token_id")
              where "t"."contract" = "i"."contract"::text
                and "t"."token_id" = "i"."token_id"::numeric(78, 0)
            `
          );
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
