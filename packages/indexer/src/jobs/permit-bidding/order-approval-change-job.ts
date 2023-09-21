import { idb } from "@/common/db";
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
      await idb.none(
        `
          UPDATE orders SET
            fillability_status = 'cancelled',
            approval_status = 'disabled',
            updated_at = now()
          FROM orders as t
          LEFT JOIN permit_biddings as c on c.id = t.permit_id
          WHERE c.owner = $/owner/ 
          AND c.token = $/token/
          AND c.spender != $/spender/
          AND c.nonce < $/nonce/
          AND t.fillability_status = 'fillable'
        `,
        {
          owner: toBuffer(owner),
          spender: toBuffer(spender),
          token: toBuffer(token),
          nonce,
        }
      );
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
    }
    await this.sendBatch(orderRevalidationInfos.map((info) => ({ payload: info })));
  }
}

export const permitBiddingOrderNonceChangeJob = new PermitBiddingOrderNonceChangeJob();
