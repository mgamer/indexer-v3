import _ from "lodash";

import { randomUUID } from "crypto";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "update-attribute-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      logger.info(QUEUE_NAME, `Update attributes ${JSON.stringify(job.data)}`);
      const { contract, tokenId, price, previousPrice } = job.data as UpdateAttributeInfo;

      logger.info(QUEUE_NAME, `contract=${contract}, tokenId=${tokenId}`);
      const tokenAttributes = await Tokens.getTokenAttributes(contract, tokenId);
      const tokenAttributesIds = [];

      for (const tokenAttribute of tokenAttributes) {
        tokenAttributesIds.push(tokenAttribute.attributeId);
      }

      logger.info(QUEUE_NAME, `Attribute IDs ${JSON.stringify(tokenAttributesIds)}`);

      // If this is a new sale
      if (_.isNull(previousPrice) && !_.isNull(price)) {
        logger.info(QUEUE_NAME, `Increment sales ${JSON.stringify(job.data)}`);
        await Attributes.incrementOnSaleCount(tokenAttributesIds, 1);
      }

      // The sale was filled
      if (!_.isNull(previousPrice) && _.isNull(price)) {
        logger.info(QUEUE_NAME, `Decrement sales ${JSON.stringify(job.data)}`);
        await Attributes.incrementOnSaleCount(tokenAttributesIds, -1);
      }

      // Check for new floor price
      if (!_.isNull(price)) {
        // Check for new floor price
        const attributes = await Attributes.getAttributes(tokenAttributesIds);
        for (const attribute of attributes) {
          if (price < attribute.floorSellValue) {
            await Attributes.update(attribute.id, { floorSellValue: price });
            logger.info(QUEUE_NAME, `New price ${price} for attribute id ${attribute.id}`);
          }
        }
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type UpdateAttributeInfo = {
  contract: string;
  tokenId: string;
  price: number | null;
  previousPrice: number | null;
};

export const addToQueue = async (updateAttribute: UpdateAttributeInfo) => {
  await queue.add(randomUUID(), updateAttribute);
};
