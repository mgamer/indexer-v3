import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";
import * as newTopBidTriggerQueue from "@/jobs/websocket-events/new-top-bid-trigger-queue";

import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import { AskWebsocketEventInfo } from "./events/ask-websocket-event";
import { BidWebsocketEventInfo } from "./events/bid-websocket-event";
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
          data: eventInfo as AskWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.BuyOrder:
      await bidWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as BidWebsocketEventInfo,
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
}

export type EventInfo = NewTopBidWebsocketEventInfo | AskWebsocketEventInfo | BidWebsocketEventInfo;
