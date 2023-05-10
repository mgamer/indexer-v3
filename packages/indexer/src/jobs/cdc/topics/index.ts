/* eslint-disable @typescript-eslint/no-explicit-any */

// import { IndexerOrderEventsHandler } from "./indexer-order-events";
// import { IndexerBidEventsHandler } from "./indexer-bid-events";
// import { IndexerFillEventsHandler } from "./indexer-fill-events";
// import { IndexerApprovalEventsHandler } from "./indexer-ft-approvals";
// import { IndexerBalanceEventsHandler } from "./indexer-ft-balances";
import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerTransferEventsHandler } from "./indexer-ft-transfer-events";
// import { logger } from "@/common/logger";
// import { producer } from "..";

export const TopicHandlers: KafkaEventHandler[] = [
  // new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  // new IndexerBalanceEventsHandler(),
  // new IndexerApprovalEventsHandler(),
  // new IndexerFillEventsHandler(),
  // new IndexerBidEventsHandler(),
];
