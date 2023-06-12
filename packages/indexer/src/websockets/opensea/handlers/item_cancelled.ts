import { ItemCancelledEventPayload } from "@opensea/stream-js/dist/types";

import { logger } from "@/common/logger";
import * as openseaOffChainCancellations from "@/jobs/order-updates/misc/opensea-off-chain-cancellations";
import { getSupportedChainName } from "@/websockets/opensea/utils";

export const handleEvent = async (payload: ItemCancelledEventPayload) => {
  logger.info("opensea-debug", JSON.stringify({ payload }));

  if (getSupportedChainName() != payload.item.chain.name) {
    return null;
  }

  await openseaOffChainCancellations.addToQueue(payload.order_hash);

  return null;
};
