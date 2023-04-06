export type OrderKind = "single-token" | "contract-wide";

export enum QuoteType {
  Bid,
  Ask,
}

export enum CollectionType {
  ERC721,
  ERC1155,
}

export type MakerOrderParams = {
  kind?: OrderKind;

  quoteType: QuoteType;
  globalNonce: string;
  subsetNonce: string;
  orderNonce: string;
  strategyId: number;
  collectionType: CollectionType;

  collection: string;
  currency: string;
  signer: string;

  startTime: number;
  endTime: number;
  price: string;
  itemIds: string[];
  amounts: string[];

  additionalParameters: string;

  v?: number;
  r?: string;
  s?: string;
};

export type TakerOrderParams = {
  recipient: string;
  additionalParameters: string;
};
