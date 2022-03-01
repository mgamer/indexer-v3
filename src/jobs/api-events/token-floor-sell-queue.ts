import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";

const QUEUE_NAME = "api-events-token-floor-sell-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const event = job.data as ApiEvent;

      try {
        const value = {
          kind: event.kind,
          contract: toBuffer(event.contract),
          token_id: event.tokenId,
          order_id: event.orderId || null,
          maker: event.maker ? toBuffer(event.maker) : null,
          price: event.price || null,
          previous_price: event.previousPrice || null,
          tx_hash: event.txHash ? toBuffer(event.txHash) : null,
          tx_timestamp: event.txTimestamp || null,
        };
        const columns = new pgp.helpers.ColumnSet(
          [
            "kind",
            "contract",
            "token_id",
            "order_id",
            "maker",
            "price",
            "previous_price",
            "tx_hash",
            "tx_timestamp",
            { name: "created_at", init: () => "now()", mod: ":raw" },
          ],
          { table: "token_floor_sell_events" }
        );
        await db.none(pgp.helpers.insert(value, columns));
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type ApiEvent = {
  kind: TriggerKind;
  contract: string;
  tokenId: string;
  orderId?: string | null;
  maker?: string | null;
  price?: string | null;
  previousPrice?: string | null;
  txHash?: string | null;
  txTimestamp?: number | null;
};

export const addToQueue = async (events: ApiEvent[]) => {
  await queue.addBulk(
    events.map((event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};
