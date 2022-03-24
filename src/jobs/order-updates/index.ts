import * as Sdk from "@reservoir0x/sdk";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
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

  cron.schedule(
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["dynamic-orders-update-lock"], 10 * 60 * 1000)
        .then(async () => {
          logger.info(`dynamic-orders-update`, "Updating dynamic orders");

          try {
            let continuation: string | undefined;
            const limit = 1000;

            let done = false;
            while (!done) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dynamicOrders: { id: string; raw_data: any }[] = await idb.manyOrNone(
                `
                  SELECT
                    orders.id,
                    orders.raw_data
                  FROM orders
                  WHERE orders.dynamic
                    AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                    ${continuation ? "AND orders.id > $/continuation/" : ""}
                  ORDER BY orders.id
                  LIMIT ${limit}
                `,
                { continuation }
              );

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const values: any[] = [];
              for (const { id, raw_data } of dynamicOrders) {
                const order = new Sdk.WyvernV23.Order(config.chainId, raw_data);
                values.push({
                  id,
                  // TODO: We should have a generic method for deriving the `value` from `price`.
                  price: order.getMatchingPrice(),
                  value: order.getMatchingPrice(),
                });
              }

              const columns = new pgp.helpers.ColumnSet(["id", "price", "value"], {
                table: "orders",
              });
              if (values.length) {
                await idb.none(pgp.helpers.update(values, columns));
              }

              await orderUpdatesById.addToQueue(
                dynamicOrders.map(
                  ({ id }) =>
                    ({
                      context: `dynamic-orders-update-${Math.floor(Date.now() / 1000)}-${id}`,
                      id,
                      trigger: { kind: "revalidation" },
                    } as orderUpdatesById.OrderInfo)
                )
              );

              if (dynamicOrders.length >= limit) {
                continuation = dynamicOrders[dynamicOrders.length - 1].id;
              } else {
                done = true;
              }
            }
          } catch (error) {
            logger.error(`dynamic-orders-update`, `Failed to handle dynamic orders: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
