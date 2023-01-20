import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb, pgp } from "@/common/db";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import _ from "lodash";
import { toBuffer } from "@/common/utils";

const QUEUE_NAME = "events-sync-nft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 20000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { id } = job.data;
      let { query } = (await MqJobsDataManager.getJobData(id)) || {};
      const tokenValues = [];

      if (!query) {
        return;
      }

      if (!_.includes(query, "ORDER BY")) {
        query = _.replace(
          query,
          `FROM "x"`,
          `FROM "x" ORDER BY "address" ASC, "token_id" ASC, "owner" ASC`
        );
      }

      if (_.includes(query, `INSERT INTO "tokens"`) && !_.includes(query, "collection_id")) {
        const matches = query.replace("\\x", "0x").match(/VALUES (.+)/g);
        if (matches) {
          const values = _.split(_.replace(matches[0], "VALUES ", ""), "),(");

          for (const val of values) {
            const params = _.split(_.trim(val, "'()"), ",");
            if (params) {
              tokenValues.push({
                contract: toBuffer(params[0]),
                token_id: _.trim(params[1], "'"),
                minted_timestamp: Number(params[2]),
              });
            }
          }

          const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "minted_timestamp"], {
            table: "tokens",
          });

          query = `
            INSERT INTO "tokens" (
              "contract",
              "token_id",
              "minted_timestamp"
            ) VALUES ${pgp.helpers.values(_.sortBy(tokenValues, ["contract", "token_id"]), columns)}
            ON CONFLICT (contract, token_id) DO UPDATE 
            SET minted_timestamp = EXCLUDED.minted_timestamp
            WHERE EXCLUDED.minted_timestamp < tokens.minted_timestamp
          `;
        }
      }

      try {
        await idb.none(query);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed flushing nft transfer events to the database: ${query} error=${error}`
        );
        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      // It's very important to have this queue be single-threaded
      // in order to avoid database write deadlocks (and it can be
      // even better to have it be single-process).
      concurrency: 5,
    }
  );

  worker.on("completed", async (job) => {
    const { id } = job.data;
    await MqJobsDataManager.deleteJobData(id);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (query: string) => {
  const ids = await MqJobsDataManager.addJobData(QUEUE_NAME, { query });
  await Promise.all(_.map(ids, async (id) => await queue.add(id, { id })));
};

export const addToQueueByJobDataId = async (id: string) => {
  await queue.add(id, { id });
};
