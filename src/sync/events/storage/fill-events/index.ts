import { BaseEventParams } from "@/events-sync/parser";
import { OrderKind } from "@/orderbook/orders";

export * from "@/events-sync/storage/fill-events/common";
export * from "@/events-sync/storage/fill-events/zeroex-v4";
export * from "@/events-sync/storage/fill-events/foundation";

export type Event = {
  orderKind: OrderKind;
  orderId?: string;
  orderSide: "buy" | "sell";
  maker: string;
  taker: string;
  price: string;
  contract: string;
  tokenId: string;
  amount: string;
  fillSource?: string;
  baseEventParams: BaseEventParams;
};

export type DbEvent = {
  address: Buffer;
  block: number;
  block_hash: Buffer;
  tx_hash: Buffer;
  tx_index: number;
  log_index: number;
  timestamp: number;
  batch_index: number;
  order_kind: OrderKind;
  order_id: string | null;
  order_side: "buy" | "sell";
  maker: Buffer;
  taker: Buffer;
  price: string;
  contract: Buffer;
  token_id: string;
  amount: string;
  fill_source: string | null;
};
