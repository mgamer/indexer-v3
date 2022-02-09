import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";

import { syncArweave } from "@/arweave-sync/index";
import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "arweave-sync-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      try {
        let localBlock = Number(await redis.get(`${QUEUE_NAME}-last-block`));
        if (localBlock === 0) {
          localBlock = (await arweaveGateway.blocks.getCurrent()).height;
          await redis.set(`${QUEUE_NAME}-last-block`, localBlock);
        } else {
          localBlock++;
        }

        // TODO: It is possible to filter and fetch pending Arweave
        // transactions (eg. still in the mempool) by using exactly
        // the same gql query we're using but removing filtering by
        // block. We should integrate it so that we get orders asap.
        // https://discordapp.com/channels/357957786904166400/358038065974870018/940653379133272134

        let { lastBlock, lastCursor, done } = await syncArweave({
          fromBlock: localBlock,
        });
        while (!done) {
          ({ lastBlock, lastCursor, done } = await syncArweave({
            fromBlock: localBlock,
            afterCursor: lastCursor,
          }));
        }

        if (lastBlock) {
          await redis.set(`${QUEUE_NAME}-last-block`, lastBlock);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Arweave realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(uuidv4(), {});
};
