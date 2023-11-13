export enum OrderProtocols {
  ERC721_FILL_OR_KILL,
  ERC1155_FILL_OR_KILL,
  ERC1155_FILL_PARTIAL,
}

export enum PaymentSettings {
  DefaultPaymentMethodWhitelist,
  AllowAnyPaymentMethod,
  CustomPaymentMethodWhitelist,
  PricingConstraints,
}

export type OrderKind =
  | "sale-approval"
  | "item-offer-approval"
  | "collection-offer-approval"
  | "tokenset-offer-approval";

export type SignatureECDSA = {
  v: number;
  r: string;
  s: string;
};

export type CoSignature = {
  v: number;
  r: string;
  s: string;
  signer: string;
  taker: string;
  expiration: number;
};

export type MatchedOrder = {
  protocol: OrderProtocols;
  maker: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  nonce: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  requestedFillAmount: string;
  minimumFillAmount: string;

  signature: SignatureECDSA;
};

export type SweepOrder = {
  protocol: OrderProtocols;
  tokenAddress: string;
  paymentMethod: string;
  beneficiary: string;
};

export type SweepItem = {
  maker: string;
  marketplace: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  nonce: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
};

export type SweepOrderParams = {
  sweepOrder: SweepOrder;
  items: SweepItem[];
  signedSellOrders: SignatureECDSA[];
  cosignatures: CoSignature[];
};

export type BaseOrder = {
  kind?: OrderKind;

  protocol: number;
  sellerOrBuyer: string;

  cosigner?: string;
  // sale only
  maxRoyaltyFeeNumerator?: string;

  // offer only
  beneficiary?: string;

  // sale and item-offer only
  tokenId?: string;

  // tokenset offer
  tokenSetMerkleRoot?: string;

  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;

  amount: string;
  price: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;

  v?: number;
  r?: string;
  s?: string;
};

export type SaleApproval = {
  protocol: number;
  seller: string;
  cosigner: string;

  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type ItemOfferApproval = {
  protocol: number;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type CollectionOfferApproval = {
  protocol: number;
  buyer: string;
  cosigner: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type TokenSetOfferApproval = {
  protocol: number;
  buyer: string;
  cosigner: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;

  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
  tokenSetMerkleRoot: string;
};
