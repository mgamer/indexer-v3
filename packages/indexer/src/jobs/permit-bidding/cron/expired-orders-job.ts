import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import cron from "node-cron";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { idb, pgp } from "@/common/db";

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
      const efftectedOrders = await idb.manyOrNone(
        `
        WITH permit_orders as (
          SELECT orders.id, trim(both '"' from cast(raw_data->'permitId' as text)) as permit_id FROM orders 
          WHERE side = 'buy'
          AND fillability_status = 'fillable'
          AND (raw_data->'permitId') is not null
        ),
        efftected_orders as (
          SELECT permit_orders.id, permit_orders.permit_id from permit_orders left join permits on permits.id = permit_orders.permit_id
          WHERE deadline < $/timestamp/
        )
        SELECT * from efftected_orders
        `,
        {
          timestamp,
        }
      );

      const cancelledValues = efftectedOrders.map(({ id }) => ({
        id,
        fillability_status: "cancelled",
      }));

      // Cancel any orders if needed
      if (cancelledValues.length) {
        const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
          table: "orders",
        });

        await idb.none(
          `
            UPDATE orders SET
              fillability_status = x.fillability_status::order_fillability_status_t,
              updated_at = now()
            FROM (VALUES ${pgp.helpers.values(
              cancelledValues,
              columns
            )}) AS x(id, fillability_status)
            WHERE orders.id = x.id::TEXT
          `
        );
      }

      if (cancelledValues.length) {
        logger.info(this.queueName, `Invalidated ${cancelledValues.length} orders`);
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
