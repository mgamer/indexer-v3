import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type PermitBiddingOrderNonceChangeJobPayload = {
  owner: string;
  token: string;
  spender: string;
  nonce: string;
  deadline?: string;
  value?: string;
};

export class PermitBiddingOrderNonceChangeJob extends AbstractRabbitMqJobHandler {
  queueName = "permit-bidding-order-nonce-change";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: PermitBiddingOrderNonceChangeJobPayload) {
    const { owner, spender, nonce, token } = payload;
    try {
      const efftectedOrders = await idb.manyOrNone(
        `
        WITH permit_orders as (
          SELECT orders.id, trim(both '"' from cast(raw_data->'permitId' as text)) as permit_id FROM orders 
          WHERE maker = $/owner/
          AND side = 'buy'
          AND fillability_status = 'fillable'
          AND (raw_data->'permitId') is not null
        ),
        efftected_orders as (
          SELECT permit_orders.id, permit_orders.permit_id from permit_orders left join permits on permits.id = permit_orders.permit_id
          WHERE token = $/token/
          AND spender != $/spender/
          AND nonce < $/nonce/
        )
        select * from efftected_orders
        `,
        {
          owner: toBuffer(owner),
          spender: toBuffer(spender),
          token: toBuffer(token),
          nonce,
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
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle permit-bidding-order-approval-change info ${JSON.stringify(
          payload
        )}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(orderRevalidationInfos: PermitBiddingOrderNonceChangeJobPayload[]) {
    // Testing purpose
    if (process.env.LOCAL_TESTING) {
      for (const job of orderRevalidationInfos) {
        await this.process(job);
      }
      return;
    }
    await this.sendBatch(orderRevalidationInfos.map((info) => ({ payload: info })));
  }
}

export const permitBiddingOrderNonceChangeJob = new PermitBiddingOrderNonceChangeJob();
