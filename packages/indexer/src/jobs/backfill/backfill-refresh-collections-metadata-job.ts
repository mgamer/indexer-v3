import { idb } from "@/common/db";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { Tokens } from "@/models/tokens";

export type BackfillRefreshCollectionsMetadataJobPayload = {
  backfillField: string;
  collectionId?: string;
};

export class BackfillRefreshCollectionsMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-refresh-collections-metadata-job";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 5;

  protected async process(payload: BackfillRefreshCollectionsMetadataJobPayload) {
    const limit = 1000;
    const { backfillField, collectionId } = payload;

    const results = await idb.manyOrNone(
      `
        SELECT id
        FROM collections
        WHERE $/backfillField/ IS NULL
        ${collectionId ? `AND id > $/collectionId/` : ""}
        ORDER BY all_time_volume DESC
        LIMIT $/limit/
      `,
      {
        limit,
        backfillField,
        collectionId,
      }
    );

    let nextContinuation;
    const collectionMetadataInfos = [];

    logger.info(
      this.queueName,
      `Worker debug. backfillField=${backfillField}, results=${
        results.length
      }, continuation=${JSON.stringify(collectionId)}`
    );

    if (results.length) {
      for (const result of results) {
        const tokenId = await Tokens.getSingleToken(result.id);
        collectionMetadataInfos.push({
          contract: result.id,
          tokenId,
          community: "",
          forceRefresh: true,
        });
      }

      await collectionMetadataQueueJob.addToQueueBulk(collectionMetadataInfos);
    }

    if (results.length == limit) {
      const lastResult = _.last(results);

      nextContinuation = {
        collectionId: lastResult.id ?? "",
        backfillField,
      };

      logger.info(
        this.queueName,
        `Worker debug.  backfillField=${backfillField}, results=${
          results.length
        }, continuation=${JSON.stringify(collectionId)}, nextContinuation=${JSON.stringify(
          nextContinuation
        )}`
      );

      await this.addToQueue([nextContinuation]);
    }
  }

  public async addToQueue(events: BackfillRefreshCollectionsMetadataJobPayload[]) {
    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export const backfillRefreshCollectionMetadataJob = new BackfillRefreshCollectionsMetadataJob();
