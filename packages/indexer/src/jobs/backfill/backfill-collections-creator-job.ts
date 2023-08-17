import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type BackfillCollectionsCreatorJobPayload = {
  continuation?: string;
};

export class BackfillCollectionsCreatorJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-collection-creator";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 5;

  protected async process(payload: BackfillCollectionsCreatorJobPayload) {
    const limit = 100;
    const { continuation } = payload;
    const result = await idb.manyOrNone(
      `
        WITH x AS (
          SELECT id AS collection_id
          FROM collections c
          WHERE creator IS NULL
          ${continuation ? `AND id > '$/continuation/'` : ""}
          ORDER BY id
          LIMIT 100
        )
        SELECT x.*, y.* FROM x
        LEFT JOIN LATERAL (
            SELECT t.contract, t.token_id
            FROM tokens t
            WHERE t.collection_id = x.collection_id
            LIMIT 1
        ) y ON TRUE        
      `,
      { limit, continuation }
    );

    for (const { contract, token_id } of result) {
      await fetchCollectionMetadataJob.addToQueue([
        {
          contract: fromBuffer(contract),
          tokenId: token_id,
          allowFallbackCollectionMetadata: false,
          context: "post-refresh-collection",
        },
      ]);
    }

    if (result.length == limit) {
      await this.addToQueue(result[result.length - 1].collection_id);
    }
  }

  public async addToQueue(events: BackfillCollectionsCreatorJobPayload[]) {
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

export const backfillCollectionsCreatorJob = new BackfillCollectionsCreatorJob();
