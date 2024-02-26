import cron from "node-cron";

import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { updateETHSDNList } from "@/utils/ofac";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export default class OfacSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "ofac-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  timeout = 120000;

  public async process() {
    try {
      await updateETHSDNList();
    } catch {
      // Skip errors
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const ofacSyncJob = new OfacSyncJob();

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "0 1 * * *",
    async () =>
      await redlock
        .acquire([`ofac-sync-cron-lock`], (5 * 60 - 5) * 1000)
        .then(async () => ofacSyncJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
