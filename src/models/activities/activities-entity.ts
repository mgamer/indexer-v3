import { fromBuffer } from "@/common/utils";

export enum ActivityType {
  sale = "sale",
  ask = "ask",
  transfer = "transfer",
  mint = "mint",
  bid = "bid",
  bid_cancel = "bid_cancel",
  ask_cancel = "ask_cancel",
}

// Define the fields required to create a new activity
export type ActivitiesEntityInsertParams = {
  type: ActivityType;
  hash: string;
  contract: string;
  collectionId: string;
  tokenId: string | null;
  fromAddress: string;
  toAddress: string | null;
  price: number;
  amount: number;
  blockHash: string | null;
  eventTimestamp: number;
  metadata?: ActivityMetadata;
};

// Define the fields need to instantiate the entity
export type ActivitiesEntityParams = {
  id: number;
  hash: string;
  type: ActivityType;
  contract: Buffer;
  collection_id: string;
  token_id: string | null;
  from_address: Buffer;
  to_address: Buffer | null;
  price: number;
  amount: number;
  block_hash: Buffer | null;
  event_timestamp: number;
  created_at: Date;
  metadata: ActivityMetadata;
};

// Possible fields to be found in the metadata
export type ActivityMetadata = {
  transactionHash?: string;
  logIndex?: number;
  batchIndex?: number;
  orderId?: string;
};

export class ActivitiesEntity {
  id: number;
  hash: string;
  type: ActivityType;
  contract: string;
  collectionId: string;
  tokenId: string | null;
  fromAddress: string;
  toAddress: string | null;
  price: number;
  amount: number;
  blockHash: string | null;
  eventTimestamp: number;
  createdAt: Date;
  metadata: ActivityMetadata;

  constructor(params: ActivitiesEntityParams) {
    this.id = params.id;
    this.hash = params.hash;
    this.type = params.type;
    this.contract = fromBuffer(params.contract);
    this.collectionId = params.collection_id;
    this.tokenId = params.token_id;
    this.fromAddress = fromBuffer(params.from_address);
    this.toAddress = params.to_address ? fromBuffer(params.to_address) : null;
    this.price = params.price;
    this.amount = Number(params.amount);
    this.blockHash = params.block_hash ? fromBuffer(params.block_hash) : null;
    this.eventTimestamp = params.event_timestamp;
    this.createdAt = params.created_at;
    this.metadata = params.metadata;
  }
}
