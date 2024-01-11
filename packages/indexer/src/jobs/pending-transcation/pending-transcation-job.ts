import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as pendingTranscation from "@/utils/pending-transcation";

export default class PendingTranscationJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-transcations";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: pendingTranscation.PendingMessage) {
    try {
      await pendingTranscation.handlePendingMessage(payload);
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle order revalidation info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(payloads: pendingTranscation.PendingMessage[]) {
    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const pendingTranscationJob = new PendingTranscationJob();
