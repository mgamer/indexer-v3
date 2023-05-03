/* eslint-disable @typescript-eslint/no-explicit-any */

import { IndexerOrderEventsHandler } from "./indexer-order-events";
import { IndexerBidEventsHandler } from "./indexer-bid-events";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-ft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-ft-balances";
import { IndexerTransferEventsHandler } from "./indexer-ft-transfer-events";
import { logger } from "@/common/logger";

export abstract class KafkaEventHandler {
  abstract topicName: string;

  async handle(payload: any): Promise<void> {
    switch (payload.op) {
      case "c":
        this.handleInsert(payload);
        break;
      case "u":
        this.handleUpdate(payload);
        break;
      case "d":
        this.handleDelete();
        break;
      default:
        logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
        break;
    }
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
