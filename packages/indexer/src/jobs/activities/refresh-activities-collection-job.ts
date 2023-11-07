import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { Collections } from "@/models/collections";
import _ from "lodash";

export type RefreshActivitiesCollectionJobPayload = {
  collectionId: string;
};

export default class RefreshActivitiesCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-collection-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesCollectionJobPayload) {
    let addToQueue = false;

    const { collectionId } = payload;
    const collection = await Collections.getById(collectionId);

    if (!_.isNull(collection)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesCollection(
        collection.id,
        collection.isSpam
      );

      if (keepGoing) {
        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public async onCompleted(message: RabbitMQMessage, processResult: { addToQueue: boolean }) {
    if (processResult.addToQueue) {
      await this.addToQueue(message.payload);
    }
  }

  public async addToQueue(payload: RefreshActivitiesCollectionJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({
      payload,
      jobId: payload.collectionId,
    });
  }
}

export const refreshActivitiesCollectionJob = new RefreshActivitiesCollectionJob();
