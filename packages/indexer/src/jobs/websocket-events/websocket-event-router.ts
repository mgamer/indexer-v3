import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";

import * as newTopBidTriggerQueue from "@/jobs/websocket-events/new-top-bid-trigger-queue";
import * as balanceEventWebsocketEventsTriggerQueue from "@/jobs/websocket-events/nft-balance-event-websocket-events-trigger-queue";
import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import { NewTopBidWebsocketEventInfo } from "./events/new-top-bid-websocket-event";

export const WebsocketEventRouter = async ({
  eventKind,
  eventInfo,
}: {
  eventKind: WebsocketEventKind;
  eventInfo: EventInfo;
}) => {
  switch (eventKind) {
    case WebsocketEventKind.SellOrder:
      await askWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as askWebsocketEventsTriggerQueue.AskWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.BuyOrder:
      await bidWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as bidWebsocketEventsTriggerQueue.BidWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.BalanceEvent:
      await balanceEventWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as balanceEventWebsocketEventsTriggerQueue.BalanceWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.NewTopBid:
      await newTopBidTriggerQueue.addToQueue([
        {
          data: eventInfo as NewTopBidWebsocketEventInfo,
        },
      ]);
      break;
  }
};

export enum WebsocketEventKind {
  NewTopBid = "new-top-bid",
  SellOrder = "sell-order",
  BuyOrder = "buy-order",
  BalanceEvent = "balance-event",
}

export type EventInfo =
  | NewTopBidWebsocketEventInfo
  | askWebsocketEventsTriggerQueue.AskWebsocketEventInfo
  | bidWebsocketEventsTriggerQueue.BidWebsocketEventInfo
  | balanceEventWebsocketEventsTriggerQueue.BalanceWebsocketEventInfo;
