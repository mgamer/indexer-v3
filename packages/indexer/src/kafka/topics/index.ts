import { KafkaTopicHandler } from "kafka";
import { IndexerOrderEventsHandler } from "./debeezium/indexer-order-events";
import { IndexerBidEventsHandler } from "./debeezium/indexer-bid-events";
import { IndexerFillEventsHandler } from "./debeezium/indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./debeezium/indexer-ft-approvals";
import { IndexerBalanceEventsHandler } from "./debeezium/indexer-ft-balances";
import { IndexerTransferEventsHandler } from "./debeezium/indexer-ft-transfer-events";

export const KafkaTopics = [
  "indexer.public.order_events",
  "indexer.public.bid_events",
  "indexer.public.fill_events_2",
  "indexer.public.ft_approvals",
  "indexer.public.ft_balances",
  "indexer.public.ft_transfer_events",
];

export const TopicHandlers: KafkaTopicHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
