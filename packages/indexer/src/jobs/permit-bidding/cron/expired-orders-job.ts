import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import cron from "node-cron";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";

export class OrderUpdatesExpiredPermitBiddingOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "permit-bidding-expired-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 60;

  protected async process() {
    logger.info(this.queueName, "Invalidating expired orders");
    const timestamp = now();
    try {
      const expiredOrders: { id: string }[] = await idb.manyOrNone(
        `
          WITH x AS (
            SELECT
              permit_biddings.id
            FROM permit_biddings
            WHERE deadline < $/timestamp/
          )
          UPDATE orders SET
            fillability_status = 'expired',
            updated_at = now()
          FROM x
          WHERE orders.permit_id = x.id
          AND orders.fillability_status = 'fillable'
          RETURNING orders.id
        `,
        { timestamp }
      );

      if (expiredOrders.length) {
        logger.info(this.queueName, `Invalidated ${expiredOrders.length} orders`);
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle permit-bidding-order-approval-change info ${JSON.stringify(
          timestamp
        )}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const orderUpdatesExpiredPermitBiddingOrderJob =
  new OrderUpdatesExpiredPermitBiddingOrderJob();

if (config.doBackgroundWork) {
  cron.schedule(
    `*/${orderUpdatesExpiredPermitBiddingOrderJob.intervalInSeconds} * * * * *`,
    async () =>
      await redlock
        .acquire(
          ["expired-permit-bidding-orders-check-lock"],
          (orderUpdatesExpiredPermitBiddingOrderJob.intervalInSeconds - 3) * 1000
        )
        .then(async () => {
          logger.info(
            orderUpdatesExpiredPermitBiddingOrderJob.queueName,
            "Triggering expired permit bidding orders check"
          );
          await orderUpdatesExpiredPermitBiddingOrderJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
