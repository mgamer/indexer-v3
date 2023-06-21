import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { randomUUID } from "crypto";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";

export type EventsSyncFtTransfersWriteBufferPayload = {
  query: string;
};

export class EventsSyncFtTransfersWriteBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-ft-transfers-write";
  maxRetries = 10;
  concurrency = 10;
  useSharedChannel = false;
  lazyMode = true;

  protected async process(payload: EventsSyncFtTransfersWriteBufferPayload) {
    const { query } = payload;

    try {
      await edb.none(query);
    } catch (error) {
      logger.error(this.queueName, `Failed flushing ft transfer events to the database: ${error}`);
      throw error;
    }
  }

  public async addToQueue(
    queries: EventsSyncFtTransfersWriteBufferPayload[],
    delay = 60 * 5 * 1000
  ) {
    await this.sendBatch(queries.map((q) => ({ payload: q, jobId: `${randomUUID()}`, delay })));
  }
}

export const eventsSyncFtTransfersWriteBufferJob = new EventsSyncFtTransfersWriteBufferJob();
