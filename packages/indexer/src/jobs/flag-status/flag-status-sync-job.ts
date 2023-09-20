/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { TokensEntityUpdateParams } from "@/models/tokens/tokens-entity";
import { Tokens } from "@/models/tokens";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { flagStatusProcessJob } from "@/jobs/flag-status/flag-status-process-job";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";

export type FlagStatusSyncJobPayload = {
  contract: string;
  collectionId: string;
  force?: boolean;
};

export class FlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  tokensLimit = 25000;
  sleepTime = 60; // in minutes
  useSharedChannel = true;

  protected async process(payload: FlagStatusSyncJobPayload) {
    const { collectionId, contract, force } = payload;

    // check last update time, skip if it's too early (less than sleepTime)
    const lastUpdate = await Tokens.getLastFlagUpdate(contract);
    if (
      !force &&
      lastUpdate &&
      new Date().getTime() - new Date(lastUpdate).getTime() < this.sleepTime * 60 * 1000
    ) {
      logger.info(
        this.queueName,
        `Flag Status Skip. collectionId:${collectionId}, contract:${contract}, lastUpdate:${lastUpdate}`
      );

      return;
    }

    let continuation;
    let tokens: { contract: string; tokenId: string; flagged: boolean }[] = [];
    let isDone = false;
    while (!isDone && tokens.length < this.tokensLimit) {
      const result = await openseaMetadataProvider._getTokensFlagStatus(contract, continuation);

      tokens = tokens.concat(result.data);
      continuation = result.continuation;

      if (!continuation) {
        isDone = true;
        break;
      }
    }

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const isFlagged = Number(token.flagged);

          const currentUtcTime = new Date().toISOString();

          const fields: TokensEntityUpdateParams = {
            isFlagged,
            lastFlagUpdate: currentUtcTime,
          };

          const result = await Tokens.updateFlagStatus(contract, token.tokenId, fields);

          if (result) {
            logger.info(
              this.queueName,
              `Flag Status Diff. collectionId:${collectionId}, contract:${contract}, tokenId: ${token.tokenId}, tokenIsFlagged:${token.flagged}, isFlagged:${isFlagged}`
            );

            await nonFlaggedFloorQueueJob.addToQueue([
              {
                kind: "revalidation",
                contract,
                tokenId: token.tokenId,
                txHash: null,
                txTimestamp: null,
              },
            ]);
          } else {
            logger.info(
              this.queueName,
              `Flag Status No Change. collectionId:${collectionId}, contract:${contract}, tokenId: ${token.tokenId}, tokenIsFlagged:${token.flagged}, isFlagged:${isFlagged}`
            );
          }
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(
              this.queueName,
              `Too Many Requests. collectionId:${collectionId}, contract:${contract}, error: ${JSON.stringify(
                (error as any).response.data
              )}`
            );
          } else {
            logger.error(
              this.queueName,
              `getTokenMetadata error. collectionId:${collectionId}, contract:${contract}, error:${error}`
            );
          }
        }
      })
    );

    await flagStatusProcessJob.addToQueue();
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: FlagStatusSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const flagStatusSyncJob = new FlagStatusSyncJob();
