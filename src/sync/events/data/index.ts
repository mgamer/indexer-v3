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
  | "erc20-transfer"
  | "erc721-transfer"
  | "erc1155-transfer-single"
  | "erc1155-transfer-batch"
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

export const allEventData = [
  erc721.transfer,
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

export const allEventTopics = [
  // Only keep unique topics (eg. an example of duplicated topics are
  // erc721 and erc20 transfers which have the exact same signature).
  ...new Set(allEventData.map(({ topic }) => topic)),
];
