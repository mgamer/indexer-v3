import cron from "node-cron";

import { idb } from "@/common/db";
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
            // TODO: Instead of updating everything in one go we should execute
            // smaller batches and use keyset pagination to iterate through all
            // of the expired orders (keyset pagination is amazing).

            const expiredOrders: { id: string }[] = await idb.manyOrNone(`
              UPDATE "orders" SET
                "fillability_status" = 'expired',
                "expiration" = UPPER("valid_between")
              WHERE UPPER("valid_between") < NOW()
                AND ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance')
              RETURNING "id"
            `);

            await orderUpdatesById.addToQueue(
              expiredOrders.map(
                ({ id }) =>
                  ({
                    context: `expired-orders-check-${Math.floor(Date.now() / 1000)}-${id}`,
                    id,
                    trigger: { kind: "expiry" },
                  } as orderUpdatesById.OrderInfo)
              )
            );
          } catch (error) {
            logger.error(`expired-orders-check`, `Failed to handle expired orders: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
