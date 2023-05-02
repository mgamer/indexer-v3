import { KafkaTopicHandler } from "cdc";
import { IndexerOrderEventsHandler } from "./indexer-order-events";
import { IndexerBidEventsHandler } from "./indexer-bid-events";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-ft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-ft-balances";
import { IndexerTransferEventsHandler } from "./indexer-ft-transfer-events";

export const TopicHandlers: KafkaTopicHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
