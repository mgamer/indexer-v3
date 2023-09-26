/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { config } from "@/config/index";
import {
  getTokensFlagStatusWithTokenIds,
  handleTokenFlagStatusUpdate,
} from "@/jobs/flag-status/utils";
import { acquireLock, doesLockExist, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";

export type TokenFlagStatusSyncJobPayload = {
  tokens: { contract: string; tokenId: string }[];
};

export class TokenFlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "token-flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;
  disableConsuming = !config.disableFlagStatusRefreshJob || !config.liquidityOnly;

  protected async process(payload: TokenFlagStatusSyncJobPayload) {
    if (!payload.tokens) {
      throw new Error("Missing tokens");
    }

    if (!(await doesLockExist(this.getLockName()))) {
      await acquireLock(this.getLockName(), 60);
    }

    try {
      const tokens: { contract: string; tokenId: string; flagged: boolean | null }[] =
        await getTokensFlagStatusWithTokenIds(payload.tokens);

      await Promise.all(
        tokens.map(async (token) =>
          handleTokenFlagStatusUpdate({
            context: this.queueName,
            token,
          })
        )
      );
    } catch (error) {
      if ((error as any).response?.status === 429) {
        logger.info(
          this.queueName,
          `Too Many Requests.  error: ${JSON.stringify((error as any).response.data)}`
        );

        const expiresIn = (error as any).response.data.expires_in;

        // add back to queue with delay
        await this.send({ payload }, expiresIn * 1000);
        return;
      }
      logger.error(this.queueName, `Error: ${JSON.stringify(error)}`);
    }

    await releaseLock(this.getLockName());
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: TokenFlagStatusSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const tokenFlagStatusSyncJob = new TokenFlagStatusSyncJob();
