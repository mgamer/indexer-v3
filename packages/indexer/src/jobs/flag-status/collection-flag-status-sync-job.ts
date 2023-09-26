/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import {
  getTokensFlagStatusForCollection,
  handleTokenFlagStatusUpdate,
} from "@/jobs/flag-status/utils";
import { acquireLock, doesLockExist, extendLock, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";

export type CollectionFlagStatusSyncJobPayload = {
  slug: string;
  continuation: string;
};

export class CollectionFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  tokensLimit = 25000;
  useSharedChannel = true;
  disableConsuming = !config.disableFlagStatusRefreshJob || !config.liquidityOnly;

  protected async process(payload: CollectionFlagStatusSyncJobPayload) {
    const { slug } = payload;
    if (!slug) {
      throw new Error("Missing slug");
    }

    if (!(await doesLockExist(this.getLockName()))) {
      await acquireLock(this.getLockName(), 60);
    }

    try {
      const { tokens, continuation: nextContinuation } = await getTokensFlagStatusForCollection(
        slug,
        payload.continuation
      );

      await Promise.all(
        tokens.map(async (token) => handleTokenFlagStatusUpdate({ context: this.queueName, token }))
      );

      if (nextContinuation) {
        await this.send({ payload: { slug, continuation: nextContinuation } }, 1000);
        return;
      }
    } catch (error) {
      if ((error as any).response?.status === 429) {
        logger.info(
          this.queueName,
          `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
        );

        const expiresIn = (error as any).response.data.expires_in;

        // extend lock
        await extendLock(this.getLockName(), expiresIn * 1000 + 60000);
        // add back to queue with delay
        await this.send({ payload }, expiresIn * 1000);
        return;
      } else {
        logger.error(this.queueName, `Error: ${JSON.stringify(error)}`);
      }
    }
    await releaseLock(this.getLockName());
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: CollectionFlagStatusSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const collectionFlagStatusSyncJob = new CollectionFlagStatusSyncJob();
