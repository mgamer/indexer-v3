import { fromBuffer } from "@/common/utils";

export enum ActivityType {
  sale = "sale",
  listing = "listsing",
}

// Define the fields we can update
export type ActivitiesEntityUpdateParams = {
  transactionHash: Buffer;
  createdAt?: string;
  contract?: Buffer;
  collectionId?: string;
  tokenId?: string;
  address?: Buffer;
  fromAddress?: Buffer;
  toAddress?: Buffer;
  price?: number;
  amount?: number;
};

// Define the fields need to instantiate the entity
export type ActivitiesEntityParams = {
  id: number;
  created_at: string;
  tx_hash: Buffer;
  contract: Buffer;
  collection_id: string;
  token_id: string;
  address: Buffer;
  from_address: Buffer;
  to_address: Buffer;
  price: number;
  amount: number;
};

export class ActivitiesEntity {
  id: number;
  createdAt: string;
  transactionHash: string;
  collectionId: string;
  contract: string;
  tokenId: string;
  address: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;

  constructor(params: ActivitiesEntityParams) {
    this.id = params.id;
    this.createdAt = params.created_at;
    this.transactionHash = fromBuffer(params.tx_hash);
    this.contract = fromBuffer(params.contract);
    this.collectionId = params.collection_id;
    this.tokenId = params.token_id;
    this.address = fromBuffer(params.address);
    this.fromAddress = fromBuffer(params.from_address);
    this.toAddress = fromBuffer(params.to_address);
    this.price = params.price;
    this.amount = params.amount;
  }
}
