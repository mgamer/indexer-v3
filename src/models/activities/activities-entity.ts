import { fromBuffer } from "@/common/utils";

export enum ActivityType {
  sale = "sale",
  listing = "listing",
}

// Define the fields required to create a new activity
export type ActivitiesEntityInsertParams = {
  transactionId: string;
  contract: string;
  collectionId: string;
  tokenId: string;
  address: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;
  metadata?: ActivityMetadata;
};

// Define the fields we can update
export type ActivitiesEntityUpdateParams = {
  createdAt?: string;
  contract?: string;
  collectionId?: string;
  tokenId?: string;
  address?: string;
  fromAddress?: string;
  toAddress?: string;
  price?: number;
  amount?: number;
  metadata?: ActivityMetadata;
};

// Define the fields need to instantiate the entity
export type ActivitiesEntityParams = {
  id: number;
  created_at: Date;
  transaction_id: Buffer;
  type: ActivityType;
  contract: Buffer;
  collection_id: string;
  token_id: string;
  address: Buffer;
  from_address: Buffer;
  to_address: Buffer;
  price: number;
  amount: number;
  metadata: ActivityMetadata;
};

// Possible fields to be found in the metadata
export type ActivityMetadata = {
  transactionHash?: string | undefined;
  logIndex?: number | undefined;
  batchIndex?: number | undefined;
};

export class ActivitiesEntity {
  id: number;
  createdAt: Date;
  transactionId: string;
  type: ActivityType;
  contract: string;
  collectionId: string;
  tokenId: string;
  address: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;
  metadata: ActivityMetadata;

  constructor(params: ActivitiesEntityParams) {
    this.id = params.id;
    this.createdAt = params.created_at;
    this.transactionId = fromBuffer(params.transaction_id);
    this.type = params.type;
    this.contract = fromBuffer(params.contract);
    this.collectionId = params.collection_id;
    this.tokenId = params.token_id;
    this.address = fromBuffer(params.address);
    this.fromAddress = fromBuffer(params.from_address);
    this.toAddress = fromBuffer(params.to_address);
    this.price = params.price;
    this.amount = params.amount;
    this.metadata = params.metadata;
  }
}
