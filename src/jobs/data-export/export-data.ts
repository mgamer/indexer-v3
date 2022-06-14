import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import AWS from "aws-sdk";

import { AskEventsDataSource } from "@/jobs/data-export/data-sources/ask-events";
import { TokenFloorSellEventsDataSource } from "@/jobs/data-export/data-sources/token-floor-sell-events";
import { CollectionFloorSellEventsDataSource } from "@/jobs/data-export/data-sources/collection-floor-sell-events";
import { AsksDataSource } from "@/jobs/data-export/data-sources/asks";
import { TokensDataSource } from "@/jobs/data-export/data-sources/tokens";
import { CollectionsDataSource } from "@/jobs/data-export/data-sources/collections";

const QUEUE_NAME = "export-data-queue";
const QUERY_LIMIT = 1000;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
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

      logger.info(QUEUE_NAME, `Export started. kind:${kind}, backfill:${backfill}`);

      try {
        const { cursor, sequenceNumber } = await getSequenceInfo(kind);
        const { data, nextCursor } = await getDataSource(kind).getSequenceData(cursor, QUERY_LIMIT);

        if (data.length) {
          const sequenceNumberPadded = ("000000000000000" + sequenceNumber).slice(-15);

          await uploadSequenceToS3(
            `${kind}/reservoir_${sequenceNumberPadded}.json`,
            JSON.stringify(data)
          );
          await setNextSequenceInfo(kind, nextCursor);
        }

        // Trigger next sequence only if there are more results and in backfill mode
        job.data.addToQueue = backfill && data.length == QUERY_LIMIT;

        logger.info(
          QUEUE_NAME,
          `Export finished. kind:${kind}, backfill:${backfill}, cursor:${cursor}, sequenceNumber:${sequenceNumber}`
        );
      } catch (error) {
        logger.error(QUEUE_NAME, `Export ${kind} failed: ${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.kind, job.data.backfill);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum DataSourceKind {
  askEvents = "ask-events",
  tokenFloorSellEvents = "token-floor-sell-events",
  collectionFloorSellEvents = "collection-floor-sell-events",
  asks = "asks",
  tokens = "tokens",
  collections = "collections",
}

export const addToQueue = async (kind: DataSourceKind, backfill = false) => {
  await queue.add(randomUUID(), { kind, backfill }, { jobId: kind });
};

const getSequenceInfo = async (kind: DataSourceKind) => {
  const query = `SELECT cursor,
                        sequence_number AS "sequenceNumber"
                   FROM data_export_tasks
                   WHERE source = $/kind/`;

  return await idb.one(query, {
    kind,
  });
};

const setNextSequenceInfo = async (
  kind: DataSourceKind,
  cursor: Record<string, unknown> | null
) => {
  const query = `
          UPDATE data_export_tasks
          SET cursor = $/cursor/,
              sequence_number = sequence_number + 1,
              updated_at = now()
          WHERE source = $/kind/
        `;

  await idb.none(query, {
    kind,
    cursor,
  });
};

const getDataSource = (kind: DataSourceKind) => {
  switch (kind) {
    case DataSourceKind.askEvents:
      return new AskEventsDataSource();
    case DataSourceKind.tokenFloorSellEvents:
      return new TokenFloorSellEventsDataSource();
    case DataSourceKind.collectionFloorSellEvents:
      return new CollectionFloorSellEventsDataSource();
    case DataSourceKind.asks:
      return new AsksDataSource();
    case DataSourceKind.tokens:
      return new TokensDataSource();
    case DataSourceKind.collections:
      return new CollectionsDataSource();
  }

  throw new Error(`Unsupported data source ${kind}`);
};

const uploadSequenceToS3 = async (key: string, data: string) => {
  const s3UploadAWSCredentials = await getAwsCredentials();

  await new AWS.S3(s3UploadAWSCredentials)
    .putObject({
      Bucket: config.dataExportS3BucketName,
      Key: key,
      Body: data,
      ContentType: "application/json",
      ACL: "bucket-owner-full-control",
    })
    .promise();
};

const getAwsCredentials = async () => {
  let sts = new AWS.STS({
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  const accessRole = await sts
    .assumeRole({
      RoleArn: config.dataExportAwsAccessRole,
      RoleSessionName: "AssumeRoleSession",
    })
    .promise();

  sts = new AWS.STS({
    accessKeyId: accessRole?.Credentials?.AccessKeyId,
    secretAccessKey: accessRole?.Credentials?.SecretAccessKey,
    sessionToken: accessRole?.Credentials?.SessionToken,
  });

  const uploadRole = await sts
    .assumeRole({
      RoleArn: config.dataExportAwsS3UploadRole,
      RoleSessionName: "UploadRoleSession",
    })
    .promise();

  return {
    accessKeyId: uploadRole?.Credentials?.AccessKeyId,
    secretAccessKey: uploadRole?.Credentials?.SecretAccessKey,
    sessionToken: uploadRole?.Credentials?.SessionToken,
  };
};
