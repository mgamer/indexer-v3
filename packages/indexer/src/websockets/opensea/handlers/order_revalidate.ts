import { OrderValidationEventPayload } from "@opensea/stream-js/dist/types";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";

export const handleEvent = async (payload: OrderValidationEventPayload) => {
  const currentStatus = await idb.oneOrNone(
    `
      SELECT
        orders.fillability_status,
        orders.approval_status
      FROM orders
      WHERE orders.id = $/id/
    `,
    {
      id: payload.order_hash,
    }
  );

  logger.info(
    "opensea-debug",
    JSON.stringify({
      orderId: payload.order_hash,
      fillabilityStatus: currentStatus?.fillability_status,
      approvalStatus: currentStatus?.approval_status,
    })
  );

  return null;
};
