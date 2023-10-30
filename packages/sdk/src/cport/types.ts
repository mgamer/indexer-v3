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

// export type Cosignature = {
//   signer: string;
//   taker: string;
//   expiration: string;
//   v: number;
//   r: string;
//   s: string;
// };

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

// export type MatchedOrderBundleBase = {
//   protocol: number;
//   paymentCoin: string;
//   tokenAddress: string;
//   privateBuyer: string;
//   buyer: string;
//   delegatedPurchaser: string;
//   marketplace: string;
//   marketplaceFeeNumerator: string;
//   offerNonce: string;
//   offerPrice: string;
//   offerExpiration: string;
// };

// export type BundledItem = {
//   tokenId: string;
//   amount: string;
//   maxRoyaltyFeeNumerator: string;
//   itemPrice: string;
//   listingNonce: string;
//   listingExpiration: string;
//   seller: string;
// };

// export type SweepMatchedOrder = {
//   bundleDetails: MatchedOrderBundleBase;
//   bundleItems: BundledItem[];
//   signedOffer: Signature;
//   signedListings: Signature[];
// };

export type BaseOrder = {
  kind?: OrderKind;

  protocol: number;
  sellerOrBuyer: string;

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

// SaleApproval(
//   uint8 protocol,
//   address seller,
//   address marketplace,
//   address paymentMethod,
//   address tokenAddress,
//   uint256 tokenId,
//   uint256 amount,
//   uint256 itemPrice,
//   uint256 expiration,
//   uint256 marketplaceFeeNumerator,
//   uint256 maxRoyaltyFeeNumerator,
//   uint256 nonce,
//   uint256 masterNonce
// )

export type SaleApproval = {
  protocol: number;
  seller: string;
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

// ItemOfferApproval(
//   uint8 protocol,
//   address buyer,
//   address beneficiary,
//   address marketplace,
//   address paymentMethod,
//   address tokenAddress,
//   uint256 tokenId,
//   uint256 amount,
//   uint256 itemPrice,
//   uint256 expiration,
//   uint256 marketplaceFeeNumerator,
//   uint256 nonce,
//   uint256 masterNonce
// )

export type ItemOfferApproval = {
  protocol: number;
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

// CollectionOfferApproval(
//   uint8 protocol,
//   address buyer,
//   address beneficiary,
//   address marketplace,
//   address paymentMethod,
//   address tokenAddress,
//   uint256 amount,
//   uint256 itemPrice,
//   uint256 expiration,
//   uint256 marketplaceFeeNumerator,
//   uint256 nonce,
//   uint256 masterNonce
// )

export type CollectionOfferApproval = {
  protocol: number;
  buyer: string;
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

// TokenSetOfferApproval(
//   uint8 protocol,
//   address buyer,
//   address beneficiary,
//   address marketplace,
//   address paymentMethod,
//   address tokenAddress,
//   uint256 amount,
//   uint256 itemPrice,
//   uint256 expiration,
//   uint256 marketplaceFeeNumerator,
//   uint256 nonce,
//   uint256 masterNonce,
//   bytes32 tokenSetMerkleRoot
// )

export type TokenSetOfferApproval = {
  protocol: number;
  buyer: string;
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
