import { idb } from "@/common/db";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { Tokens } from "@/models/tokens";

export type BackfillRefreshCollectionsMetadataJobPayload = {
  backfill?: string;
  continuation?: number;
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
    const { backfill, continuation } = payload;

    let conditions;
    switch (backfill) {
      case "missing-creator":
        conditions = `WHERE collections.creator IS NULL`;
        break;
      case "invalid-name":
        conditions = `WHERE collections.id  = collections.name`;
        break;
    }

    if (!conditions) {
      conditions = continuation ? `WHERE all_time_volume < $/continuation/` : "";
    } else {
      conditions += continuation ? ` AND all_time_volume < $/continuation/` : "";
    }

    const results = await idb.manyOrNone(
      `
        SELECT id, all_time_volume
        FROM collections
        ${conditions}
        ORDER BY all_time_volume DESC
        LIMIT $/limit/
      `,
      {
        limit,
        continuation,
      }
    );

    let nextContinuation;
    const collectionMetadataInfos = [];

    logger.info(
      this.queueName,
      `Worker debug. backfill=${backfill}, results=${results.length}, continuation=${JSON.stringify(
        continuation
      )}`
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
        continuation: lastResult.all_time_volume,
        backfill,
      };

      logger.info(
        this.queueName,
        `Worker debug.  backfill=${backfill}, results=${
          results.length
        }, continuation=${JSON.stringify(continuation)}, nextContinuation=${JSON.stringify(
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
