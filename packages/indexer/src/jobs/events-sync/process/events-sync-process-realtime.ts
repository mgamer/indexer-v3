import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import cron from "node-cron";
import { redlock } from "@/common/redis";
import { RabbitMq } from "@/common/rabbit-mq";

export class EventsSyncProcessRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-process-realtime";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: EventsBatch) {
    const { id, events, backfill } = payload;

    try {
      await processEventsBatch({ id, events, backfill });
    } catch (error) {
      logger.error(this.queueName, `Events processing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(batches: EventsBatch[], prioritized?: boolean) {
    await this.sendBatch(
      batches.map((batch) => ({ payload: batch, jobId: batch.id, priority: prioritized ? 1 : 0 }))
    );
  }
}

export const eventsSyncProcessRealtimeJob = new EventsSyncProcessRealtimeJob();

// Every minute we check the size of the queue. This will
// ensure we get notified when it's buffering up and potentially
// blocking the real-time flow of orders.
cron.schedule(
  "*/1 * * * *",
  async () =>
    await redlock
      .acquire(["realtime-process-size-check-lock"], (60 - 5) * 1000)
      .then(async () => {
        const queueSize = await RabbitMq.getQueueSize(eventsSyncProcessRealtimeJob.getQueue());
        const retryQueueSize = await RabbitMq.getQueueSize(
          eventsSyncProcessRealtimeJob.getRetryQueue()
        );

        if (queueSize + retryQueueSize >= 20000) {
          logger.error(
            "realtime-process-size-check",
            `Realtime process buffering up: size=${queueSize + retryQueueSize}`
          );
        }
      })
      .catch(() => {
        // Skip on any errors
      })
);
