import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

const JOB_NAME = "fast_metadata_index";

export const queue = new Queue(JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});
new QueueScheduler(JOB_NAME, { connection: redis.duplicate() });

export const addToFastMetadataIndexQueue = async (contract: string) => {
  await queue.add(contract, { contract });
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // TODO: Check if cleaning the queue is indeed required
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
    collection: {
      id: string;
      setId?: string;
      name: string;
      description: string;
      image: string;
      royaltyBps: number;
      royaltyRecipient?: string;
      community: string;
    };
    tokens: {
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
    }[];
  };

  const worker = new Worker(
    JOB_NAME,
    async (job: Job) => {
      const { contract } = job.data;

      try {
        logger.info(JOB_NAME, `Handling ${contract}`);

        const url = `${config.metadataApiBaseUrl}/${contract}?all=true`;
        const { data } = await axios.get(url, { timeout: 10 * 60000 });

        // Ideally, the metadata APIs should return an error status
        // in case of failure. However, just in case, we explicitly
        // check here the presence of any `error` field.
        if ((data as any).error) {
          throw new Error(JSON.stringify((data as any).error));
        }

        const queries: any[] = [];

        // Save collection high-level metadata
        const collection = (data as Metadata).collection;
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
              "token_set_id"
            ) values (
              $/id/,
              $/name/,
              $/description/,
              $/image/,
              $/royaltyBps/,
              $/royaltyRecipient/,
              $/community/,
              $/tokenSetId/
            ) on conflict do nothing
          `,
          values: {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            image: collection.image,
            royaltyBps: collection.royaltyBps,
            royaltyRecipient: collection.royaltyRecipient?.toLowerCase(),
            community: collection.community,
            tokenSetId: collection.setId,
          },
        });

        // Save tokens metadata
        {
          const tokenValues = (data as Metadata).tokens.map(
            ({ token_id, name, description, image }) => ({
              contract,
              token_id,
              collection_id: collection.id,
              name,
              description,
              image,
              metadata_indexed: true,
            })
          );
          if (tokenValues.length) {
            const columns = new pgp.helpers.ColumnSet(
              [
                "contract",
                "token_id",
                "collection_id",
                "name",
                "description",
                "image",
                "metadata_indexed",
              ],
              {
                table: "tokens",
              }
            );
            const values = pgp.helpers.values(tokenValues, columns);
            queries.push({
              query: `
                insert into "tokens" (
                  "contract",
                  "token_id",
                  "collection_id",
                  "name",
                  "description",
                  "image",
                  "metadata_indexed"
                ) values ${values}
                on conflict ("contract", "token_id") do
                update set
                  "collection_id" = excluded."collection_id",
                  "name" = excluded."name",
                  "description" = excluded."description",
                  "image" = excluded."image",
                  "metadata_indexed" = excluded."metadata_indexed"
              `,
            });
          }
        }

        // Save tokens attributes
        {
          const attributeValues = (data as Metadata).tokens
            .map(({ token_id, attributes }) =>
              attributes.map(({ key, value, kind, rank }) => ({
                collection_id: collection.id,
                contract,
                token_id,
                key,
                value,
                // TODO: Defaulting to `string` should be done at the database level
                kind: kind || "string",
                // TODO: Defaulting to `1` should be done at the database level
                rank: rank ? (rank === -1 ? null : rank) : 1,
              }))
            )
            .flat();
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
              {
                table: "attributes",
              }
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
        logger.error(
          JOB_NAME,
          `Failed to fast index metadata for contract ${contract}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );
  worker.on("error", (error) => {
    logger.error(JOB_NAME, `Worker errored: ${error}`);
  });
}
