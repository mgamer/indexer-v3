/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { releaseLock } from "@/common/redis";
import { generateCollectionTokenSetJob } from "@/jobs/flag-status/generate-collection-token-set-job";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import { TokensEntityUpdateParams } from "@/models/tokens/tokens-entity";
import { Tokens } from "@/models/tokens";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { flagStatusProcessJob } from "@/jobs/flag-status/flag-status-process-job";
import { PendingFlagStatusRefreshTokens } from "@/models/pending-flag-status-refresh-tokens";
import { config } from "@/config/index";

export type FlagStatusRefreshJobPayload = {
  contract: string;
  collectionId: string;
};

export class FlagStatusRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-refresh-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  tokensLimit = 40;
  useSharedChannel = true;
  disableConsuming = config.disableFlagStatusRefreshJob || config.liquidityOnly || false;

  protected async process(payload: FlagStatusRefreshJobPayload) {
    const { collectionId, contract } = payload;

    let delay = 0;

    // Get the tokens from the list
    const pendingFlagStatusRefreshTokensQueue = new PendingFlagStatusRefreshTokens(collectionId);
    const pendingRefreshFlagStatusTokens = await pendingFlagStatusRefreshTokensQueue.get(
      this.tokensLimit
    );

    if (pendingRefreshFlagStatusTokens.length == 0) {
      logger.info(
        this.queueName,
        `Refresh completed. collectionId:${collectionId}, contract:${contract}`
      );

      await releaseLock(this.getLockName());

      await flagStatusProcessJob.addToQueue();
      await generateCollectionTokenSetJob.addToQueue({ contract, collectionId });

      return;
    }

    const pendingRefreshFlagStatusTokensChunks = _.chunk(pendingRefreshFlagStatusTokens, 20);

    await Promise.all(
      pendingRefreshFlagStatusTokensChunks.map(async (pendingRefreshFlagStatusTokensChunk) => {
        try {
          const tokensMetadata = await MetadataProviderRouter.getTokensMetadata(
            pendingRefreshFlagStatusTokensChunk,
            "opensea",
            {
              flagged: true,
            }
          );

          for (const pendingRefreshFlagStatusToken of pendingRefreshFlagStatusTokensChunk) {
            const tokenMetadata = tokensMetadata.find(
              (tokenMetadata) => tokenMetadata.tokenId === pendingRefreshFlagStatusToken.tokenId
            );

            if (!tokenMetadata) {
              logger.warn(
                this.queueName,
                `Missing Token Metadata. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingRefreshFlagStatusToken.tokenId}, tokenIsFlagged:${pendingRefreshFlagStatusToken.isFlagged}`
              );

              continue;
            }

            const isFlagged = Number(tokenMetadata.flagged);

            const currentUtcTime = new Date().toISOString();

            const fields: TokensEntityUpdateParams = {
              isFlagged,
              lastFlagUpdate: currentUtcTime,
              lastFlagChange:
                pendingRefreshFlagStatusToken.isFlagged != isFlagged ? currentUtcTime : undefined,
            };

            await Tokens.update(contract, pendingRefreshFlagStatusToken.tokenId, fields);

            if (pendingRefreshFlagStatusToken.isFlagged != isFlagged) {
              logger.info(
                this.queueName,
                `Flag Status Diff. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingRefreshFlagStatusToken.tokenId}, tokenIsFlagged:${pendingRefreshFlagStatusToken.isFlagged}, isFlagged:${isFlagged}`
              );

              await nonFlaggedFloorQueueJob.addToQueue([
                {
                  kind: "revalidation",
                  contract,
                  tokenId: pendingRefreshFlagStatusToken.tokenId,
                  txHash: null,
                  txTimestamp: null,
                },
              ]);
            } else {
              logger.info(
                this.queueName,
                `Flag Status No Change. collectionId:${collectionId}, contract:${contract}, tokenId: ${pendingRefreshFlagStatusToken.tokenId}, tokenIsFlagged:${pendingRefreshFlagStatusToken.isFlagged}, isFlagged:${isFlagged}`
              );
            }
          }
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(
              this.queueName,
              `Too Many Requests. collectionId:${collectionId}, contract:${contract}, error: ${JSON.stringify(
                (error as any).response.data
              )}`
            );

            delay = 60 * 1000;

            await pendingFlagStatusRefreshTokensQueue.add(pendingRefreshFlagStatusTokensChunk);
          } else {
            logger.error(
              this.queueName,
              `getTokenMetadata error. collectionId:${collectionId}, contract:${contract}, error:${error}`
            );
          }
        }
      })
    );

    await this.addToQueue({ collectionId, contract }, delay);
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: FlagStatusRefreshJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const flagStatusRefreshJob = new FlagStatusRefreshJob();
