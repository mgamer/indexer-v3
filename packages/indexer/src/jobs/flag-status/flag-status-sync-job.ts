/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { TokensEntityUpdateParams } from "@/models/tokens/tokens-entity";
import { Tokens } from "@/models/tokens";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";
import _ from "lodash";

export type FlagStatusSyncJobPayload = {
  contract: string;
  collectionId: string;
  tokenIds?: string[];
  force?: boolean;
  kind: "full-collection" | "single-token";
};

export class FlagStatusSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-sync-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  tokensLimit = 25000;
  useSharedChannel = true;

  protected async process(payload: FlagStatusSyncJobPayload) {
    const { collectionId, contract } = payload;
    let tokens: { contract: string; tokenId: string; flagged: boolean | null }[] = [];

    switch (payload.kind) {
      case "full-collection":
        tokens = await this.getTokensFlagStatusForCollection(collectionId);
        break;
      case "single-token":
        if (!payload.tokenIds) {
          throw new Error("Missing tokenIds");
        }
        tokens = await this.getTokensFlagStatusWithTokenIds(contract, payload.tokenIds);
        break;
      default:
        throw new Error(`Unknown kind: ${payload.kind}`);
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
  }

  async getTokensFlagStatusWithTokenIds(
    contract: string,
    tokenIds: string[]
  ): Promise<{ contract: string; tokenId: string; flagged: boolean | null }[]> {
    // chunk token ids in groups of 20, use lodash

    const tokenIdChunks = _.chunk(tokenIds, 20);

    let tokens: {
      contract: string;
      tokenId: any;
      flagged: boolean | null;
    }[] = [];

    for (const tokenIds of tokenIdChunks) {
      const result = await openseaMetadataProvider.getTokensMetadata(
        tokenIds.map((tokenId) => ({ contract, tokenId }))
      );

      const parsedResults = result.map((token) => ({
        contract,
        tokenId: token.tokenId,
        flagged: token.flagged,
      }));

      tokens = [...tokens, ...parsedResults];
    }

    return tokens;
  }

  async getTokensFlagStatusForCollection(
    slug: string
  ): Promise<{ contract: string; tokenId: string; flagged: boolean | null }[]> {
    const tokens: { contract: string; tokenId: string; flagged: boolean | null }[] = [];

    let continuation = "";
    let isDone = false;
    while (!isDone && tokens.length < this.tokensLimit) {
      const result = await openseaMetadataProvider.getTokensMetadataBySlug(slug, continuation);

      const parsedResults = result.metadata.map((token) => ({
        contract: token.contract,
        tokenId: token.tokenId,
        flagged: token.flagged,
      }));

      tokens.push(...parsedResults);

      if (!result.continuation) {
        isDone = true;
        break;
      }

      continuation = result.continuation;
    }

    return tokens;
  }

  public getLockName() {
    return `${this.queueName}-lock`;
  }

  public async addToQueue(params: FlagStatusSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const flagStatusSyncJob = new FlagStatusSyncJob();
