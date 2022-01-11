import * as Sdk from "@reservoir0x/sdk";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

const PENDING_ORDERS_KEY = "pending_orders";

export const addPendingOrders = async (orders: Sdk.WyvernV2.Order[]) => {
  logger.info("add_pending_orders", `Adding: ${JSON.stringify(orders)}`);
  await redis.rpush(
    PENDING_ORDERS_KEY,
    orders.map((order) => JSON.stringify(order.params))
  );
};

// Only background worker processes
if (config.doBackgroundWork) {
  const CRON_NAME = "orders_relay";

  cron.schedule("*/2 * * * *", async () => {
    const lockAcquired = await acquireLock(
      `${CRON_NAME}_cron_lock`,
      2 * 60 - 5
    );
    if (lockAcquired) {
      logger.info(`${CRON_NAME}_cron`, "Relaying pending orders");

      try {
        const batchSize = 500;
        const batch = await redis.lrange(PENDING_ORDERS_KEY, 0, batchSize);
        if (batch.length) {
          const network = config.chainId === 1 ? "mainnet" : "rinkeby";
          const wallet = JSON.parse(config.arweaveRelayerKey);

          const transaction = await arweaveGateway.createTransaction(
            { data: JSON.stringify(batch.map((o) => JSON.parse(o))) },
            wallet
          );
          transaction.addTag("Content-Type", "application/json");
          transaction.addTag("App-Name", `reservoir-${network}`);
          transaction.addTag("App-Version", "0.0.1");

          await arweaveGateway.transactions
            .sign(transaction, wallet)
            .then(async () => {
              const uploader = await arweaveGateway.transactions.getUploader(
                transaction
              );
              while (!uploader.isComplete) {
                await uploader.uploadChunk();
              }
            });

          logger.info(
            `${CRON_NAME}_cron`,
            `${batch.length} pending orders relayed via transaction ${transaction.id}`
          );

          await redis.ltrim(PENDING_ORDERS_KEY, 0, batchSize);
        } else {
          logger.info(`${CRON_NAME}_cron`, "No pending orders to relay");
        }
      } catch (error) {
        logger.error(
          `${CRON_NAME}_cron`,
          `Failed to relay pending orders: ${error}`
        );
      }
    }
  });
}
