import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { OrderEventsDataSource } from "@/jobs/s3-export/data-sources/order-events";
import { TokenFloorSellEventsDataSource } from "@/jobs/s3-export/data-sources/token-floor-sell-events";
import { CollectionFloorSellEventsDataSource } from "@/jobs/s3-export/data-sources/collection-floor-sell-events";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import AWS from "aws-sdk";

const QUEUE_NAME = "export-data-source-to-s3-queue";
const QUERY_LIMIT = 1000;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, backfill } = job.data;

      try {
        const { cursor, sequenceNumber } = await getCursorAndSequenceNumber(kind);
        const { data, nextCursor } = await getDataSource(kind).getData(cursor, QUERY_LIMIT);

        if (data.length) {
          const sequenceNumberPadded = ("000000000000000" + sequenceNumber).slice(-15);

          await uploadDataToS3(
            `${kind}/reservoir_${sequenceNumberPadded}.json`,
            JSON.stringify(data)
          );
          await setCursorAndSequenceNumber(kind, nextCursor);
        }

        job.data.addToQueue = backfill && data.length == QUERY_LIMIT;
      } catch (error) {
        logger.error(QUEUE_NAME, `Export ${kind} failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.kind);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum DataSourceKind {
  orderEvents = "orderEvents",
  tokenFloorSellEvents = "tokenFloorSellEvents",
  collectionFloorSellEvents = "collectionFloorSellEvents",
}

export const addToQueue = async (kind: DataSourceKind, backfill = false) => {
  await queue.add(randomUUID(), { kind, backfill }, { jobId: kind });
};

const getCursorAndSequenceNumber = async (kind: DataSourceKind) => {
  const query = `SELECT cursor, sequence_number
                   FROM s3_export_data_sources
                   WHERE kind = $/kind/`;

  return await idb.one(query, {
    kind,
  });
};

const setCursorAndSequenceNumber = async (kind: DataSourceKind, cursor: string | null) => {
  const query = `
          UPDATE s3_export_data_sources
          SET cursor = $/cursor/,
              sequence_number = sequence_number + 1  
          WHERE kind = $/kind/
        `;

  await idb.none(query, {
    kind,
    cursor,
  });
};

const getDataSource = (kind: DataSourceKind) => {
  switch (kind) {
    case DataSourceKind.orderEvents:
      return new OrderEventsDataSource();
    case DataSourceKind.tokenFloorSellEvents:
      return new TokenFloorSellEventsDataSource();
    case DataSourceKind.collectionFloorSellEvents:
      return new CollectionFloorSellEventsDataSource();
  }

  throw new Error(`Unsupported data source ${kind}`);
};

const uploadDataToS3 = async (key: string, data: string) => {
  const s3 = new AWS.S3({
    accessKeyId: config.s3ExportAwsAccessKeyId,
    secretAccessKey: config.s3ExportAwsSecretAccessKey,
  });

  await s3
    .putObject({
      Bucket: config.s3ExportBucketName,
      Key: key,
      Body: data,
      ContentType: "application/json",
    })
    .promise();
};
