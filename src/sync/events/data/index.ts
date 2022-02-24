import { Interface } from "@ethersproject/abi";

import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";
import * as weth from "@/events-sync/data/weth";
import * as wyvernV2 from "@/events-sync/data/wyvern-v2";
import * as wyvernV23 from "@/events-sync/data/wyvern-v2.3";

// All events we're syncing should have an associated `EventData`
// entry which dictates the way the event will be parsed and then
// handled (eg. persisted to the database and relayed for further
// processing to any job queues).

export type EventDataKind =
  | "erc721-transfer"
  | "erc1155-transfer-single"
  | "erc1155-transfer-batch"
  | "erc721/1155-approval-for-all"
  | "erc20-transfer"
  | "weth-deposit"
  | "weth-withdrawal"
  | "wyvern-v2-orders-matched"
  | "wyvern-v2-order-cancelled"
  | "wyvern-v2.3-orders-matched"
  | "wyvern-v2.3-order-cancelled"
  | "wyvern-v2.3-nonce-incremented";

export type EventData = {
  kind: EventDataKind;
  addresses?: { [address: string]: boolean };
  topic: string;
  numTopics: number;
  abi: Interface;
};

export const getEventData = (eventDataKinds: EventDataKind[] | undefined) => {
  if (!eventDataKinds) {
    return [
      erc721.transfer,
      erc721.approvalForAll,
      erc1155.transferSingle,
      erc1155.transferBatch,
      weth.transfer,
      weth.deposit,
      weth.withdrawal,
      wyvernV2.orderCancelled,
      wyvernV2.ordersMatched,
      wyvernV23.orderCancelled,
      wyvernV23.ordersMatched,
      wyvernV23.nonceIncremented,
    ];
  } else {
    return (
      eventDataKinds
        .map(internalGetEventData)
        .filter(Boolean)
        // Force TS to remove `undefined`
        .map((x) => x!)
    );
  }
};

const internalGetEventData = (kind: EventDataKind): EventData | undefined => {
  switch (kind) {
    case "erc721-transfer":
      return erc721.transfer;
    case "erc721/1155-approval-for-all":
      return erc721.approvalForAll;
    case "erc1155-transfer-batch":
      return erc1155.transferBatch;
    case "erc1155-transfer-single":
      return erc1155.transferSingle;
    case "erc20-transfer":
      return weth.transfer;
    case "weth-deposit":
      return weth.deposit;
    case "weth-withdrawal":
      return weth.withdrawal;
    case "wyvern-v2-order-cancelled":
      return wyvernV2.orderCancelled;
    case "wyvern-v2-orders-matched":
      return wyvernV2.ordersMatched;
    case "wyvern-v2.3-order-cancelled":
      return wyvernV23.orderCancelled;
    case "wyvern-v2.3-orders-matched":
      return wyvernV23.ordersMatched;
    case "wyvern-v2.3-nonce-incremented":
      return wyvernV23.nonceIncremented;
    default:
      return undefined;
  }
};
