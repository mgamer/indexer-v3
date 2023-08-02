import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";
import cron from "node-cron";

export class BlockGapCheckJob extends AbstractRabbitMqJobHandler {
  queueName = "block-gap-check";
  maxRetries = 30;
  concurrency = 5;
  backoff = {
    type: "fixed",
    delay: 100,
  } as BackoffStrategy;

  protected async process() {
    try {
      const missingBlocks = await idb.query(
        `WITH last_blocks AS (
        SELECT number
        FROM blocks
        ORDER BY number DESC
        LIMIT 100000
        ),
        sequence AS (
        SELECT generate_series(
            (SELECT min(number) FROM last_blocks),
            (SELECT max(number) FROM last_blocks)
        ) AS number
        )
        SELECT s.number AS missing_block_number
        FROM sequence s
        LEFT JOIN last_blocks lb ON s.number = lb.number
        WHERE lb.number IS NULL
        ORDER BY s.number`
      );

      if (missingBlocks.length > 0) {
        logger.info(this.queueName, `Found missing blocks: ${missingBlocks.length}`);
        for (let i = 0; i < missingBlocks.length; i++) {
          logger.info(
            this.queueName,
            `Found missing block: ${missingBlocks[i].missing_block_number}`
          );
          await eventsSyncRealtimeJob.addToQueue(missingBlocks[i].missing_block_number);
        }
      }
    } catch (error) {
      logger.warn(this.queueName, `Failed to check block gap: ${error}`);
      throw error;
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const blockGapCheckJob = new BlockGapCheckJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 10 minutes
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["block-gap-check-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          logger.info("block-gap-check", "triggering block gap check");
          await blockGapCheckJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
