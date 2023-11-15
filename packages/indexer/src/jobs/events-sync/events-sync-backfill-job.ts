import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { syncEvents } from "@/events-sync/index";

export type EventSyncBackfillJobPayload = {
  block: number;
};

export default class EventsSyncBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-backfill";
  maxRetries = 10;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: EventSyncBackfillJobPayload) {
    const { block } = payload;

    try {
      await syncEvents(block);
    } catch (error) {
      logger.error(this.queueName, `Events for [${block}] backfill syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(
    block: number,
    options?: {
      prioritized?: number;
      delay?: number;
    }
  ) {
    await this.send(
      {
        payload: {
          block,
        },
      },
      options?.delay || 0,
      options?.prioritized || 1
    );
  }

  public async addToQueueBulk(
    blocks: number[],
    options?: {
      prioritized?: number;
      delay?: number;
    }
  ) {
    // Sync in reverse to handle more recent events first
    await this.sendBatch(
      blocks.map((block) => ({
        payload: {
          block,
        },
        delay: options?.delay || 0,
        priority: options?.prioritized || 1,
      }))
    );
  }
}

export const eventsSyncBackfillJob = new EventsSyncBackfillJob();
