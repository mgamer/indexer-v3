import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

// Whenever an order changes its state (eg. a new order comes in,
// a fill/cancel happens, an order gets expired, or an order gets
// revalidated/invalidated due to a change in balance or approval
// we might want to take some actions (eg. update any caches). As
// for events syncing, we have two separate job queues. The first
// one is for handling direct order state changes (cancels, fills
// or expirations - where we know the exact id of the orders that
// are affected), while the other is for indirect change of state
// - where we don't know the exact ids of the affected orders and
// some additional processing is required (eg. on balance changes
// many of the orders of a maker might change their state).

import "@/jobs/order-updates/by-id-queue";
import "@/jobs/order-updates/by-maker-queue";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "*/15 * * * * *",
    async () =>
      await redlock
        .acquire(["expired-orders-check-lock"], (15 - 5) * 1000)
        .then(async () => {
          logger.info(`expired-orders-check`, "Invalidating expired orders");

          try {
            const expiredOrders: { id: string }[] = await db.manyOrNone(`
              UPDATE "orders" SET
                "fillability_status" = 'expired',
                "expiration" = upper("valid_between")
              WHERE NOT "valid_between" @> now()
                AND ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance')
              RETURNING "id"
            `);

            await orderUpdatesById.addToQueue(
              expiredOrders.map(({ id }) => ({
                context: `expired-orders-check-${Math.floor(
                  Date.now() / 1000
                )}-${id}`,
                id,
              }))
            );
          } catch (error) {
            logger.error(
              `expired-orders-check`,
              `Failed to handle expired orders: ${error}`
            );
          }
        })
        .catch(() => {})
  );
}
