import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

export type BackfillCollectionsSplitCollectionJobPayload = {
  contract: string;
  continuation?: string;
};

export class BackfillCollectionsSplitCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collections-split-collection";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 5;

  protected async process(payload: BackfillCollectionsSplitCollectionJobPayload) {
    const limit = 100;
    const { contract, continuation } = payload;
    const result = await idb.manyOrNone(
      `
        SELECT token_id FROM tokens 
        WHERE contract = '$/contract/'
        AND collection_id = '$/collection_id/'
        ${continuation ? `AND token_id > '$/continuation/'` : ""}
        ORDER BY token_id
        LIMIT $/limit/      
      `,
      {
        limit,
        continuation,
        contract: toBuffer(contract),
        collection_id: contract,
      }
    );

    for (const { token_id } of result) {
      await metadataIndexFetchJob.addToQueue(
        [
          {
            kind: "single-token",
            data: {
              method: config.metadataIndexingMethod,
              contract,
              tokenId: token_id,
              collection: contract,
            },
            context: "post-refresh-token",
          },
        ],
        true
      );
    }

    if (result.length == limit) {
      await this.addToQueue([
        {
          contract,
          continuation: result[result.length - 1].token_id,
        },
      ]);
    }
  }

  public async addToQueue(events: BackfillCollectionsSplitCollectionJobPayload[]) {
    if (!config.doBackgroundWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export const backfillCollectionsSplitCollectionJob = new BackfillCollectionsSplitCollectionJob();
