import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

export type OnchainMetadataProcessTokenUriJobPayload = {
  contract: string;
  tokenId: string;
  uri: string;
};

export default class OnchainMetadataProcessTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-process-queue";
  maxRetries = 3;
  concurrency = 5;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: OnchainMetadataProcessTokenUriJobPayload) {
    const { contract, tokenId, uri } = payload;

    try {
      const metadata = await onchainMetadataProvider._getTokensMetadata([
        { contract, tokenId, uri },
      ]);

      if (metadata) {
        await metadataIndexWriteJob.addToQueue(metadata);
      } else {
        logger.warn(
          this.queueName,
          `No metadata found. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        );
      }
    } catch (e) {
      if (e instanceof RequestWasThrottledError) {
        logger.warn(
          this.queueName,
          `Request was throttled. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        );

        // Add to queue again with a delay from the error
        await this.addToQueue(payload, e.delay);
      } else {
        logger.error(
          this.queueName,
          `Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, error=${e}`
        );
        throw e;
      }
    }
  }

  public async addToQueue(params: OnchainMetadataProcessTokenUriJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }

  public async addToQueueBulk(params: OnchainMetadataProcessTokenUriJobPayload[]) {
    await this.sendBatch(
      params.map((param) => {
        return { payload: param };
      })
    );
  }
}

export const onchainMetadataProcessTokenUriJob = new OnchainMetadataProcessTokenUriJob();
