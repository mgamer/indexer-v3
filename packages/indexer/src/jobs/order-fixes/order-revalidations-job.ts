import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { now, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type OrderRevalidationsJobPayload =
  | {
      by: "id";
      data: {
        id: string;
        status: "active" | "inactive";
      };
    }
  | {
      by: "operator";
      data: {
        contract: string;
        operator: string;
        status: "active" | "inactive";
      };
    };

export class OrderRevalidationsJob extends AbstractRabbitMqJobHandler {
  queueName = "order-revalidations";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: OrderRevalidationsJobPayload) {
    const { by, data } = payload;
    try {
      switch (by) {
        case "id": {
          const { id, status } = data;
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = '${status === "active" ? "fillable" : "cancelled"}',
                approval_status = '${status === "active" ? "approved" : "disabled"}',
                updated_at = now()
              WHERE orders.id = $/id/
            `,
            { id }
          );
          // Recheck the order
          await orderUpdatesByIdJob.addToQueue([
            {
              context: `revalidation-${Date.now()}-${id}`,
              id,
              trigger: {
                kind: "revalidation",
              },
            } as OrderUpdatesByIdJobPayload,
          ]);
          break;
        }

        case "operator": {
          const { contract, operator, status } = data;
          for (const side of ["sell", "buy"]) {
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = '${status === "active" ? "fillable" : "cancelled"}',
                  approval_status = '${status === "active" ? "approved" : "disabled"}',
                  updated_at = now()
                WHERE orders.contract = $/contract/
                AND orders.side = $/side/
                AND orders.conduit = $/conduit/
              `,
              { contract: toBuffer(contract), side, conduit: toBuffer(operator) }
            );
          }

          break;
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle order revalidation info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(orderRevalidationInfos: OrderRevalidationsJobPayload[]) {
    await this.sendBatch(orderRevalidationInfos.map((info) => ({ payload: info })));
  }
}

export const orderRevalidationsJob = new OrderRevalidationsJob();
