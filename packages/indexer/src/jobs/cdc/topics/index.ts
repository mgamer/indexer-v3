/* eslint-disable @typescript-eslint/no-explicit-any */

import { IndexerOrderEventsHandler } from "./indexer-order-events";
import { IndexerBidEventsHandler } from "./indexer-bid-events";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-ft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-ft-balances";
import { IndexerTransferEventsHandler } from "./indexer-ft-transfer-events";
import { logger } from "@/common/logger";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { redis } from "@/common/redis";
import { randomUUID } from "crypto";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  abstract queueName: string;
  abstract queue: Queue | null;
  abstract worker: Worker | null;
  defaultJobOptions = {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  };

  async handle(payload: any): Promise<void> {
    switch (payload.op) {
      case "c":
        this.handleInsert(payload);
        break;
      case "u":
        this.handleUpdate(payload);
        break;
      case "d":
        this.handleDelete();
        break;
      default:
        logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
        break;
    }
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;

  async createQueue(): Promise<void> {
    if (this.queue) {
      return;
    }
    this.queue = new Queue(this.queueName, {
      connection: redis.duplicate(),
      defaultJobOptions: this.defaultJobOptions,
    });
    new QueueScheduler(this.queueName, { connection: redis.duplicate() });

    if (this.worker) {
      return;
    }
    this.worker = new Worker(this.queueName, async (job: Job) => {
      try {
        await this.handle(job.data);
      } catch (e) {
        logger.error(this.queueName, `Worker errored: ${e}`);
      }
    });

    this.worker.on("error", (e) => {
      logger.error(this.queueName, `Worker errored: ${e}`);
    });
  }

  async addToQueue(payload: any): Promise<void> {
    if (!this.queue) {
      logger.error(this.queueName, "Queue not initialized");
      return;
    }

    await this.queue.add(randomUUID(), payload);
  }
}

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
