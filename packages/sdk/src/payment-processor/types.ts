import { BigNumberish } from "@ethersproject/bignumber";

export enum TokenProtocols {
  ERC721,
  ERC1155,
}

export type MatchOrder = {
  sellerAcceptedOffer: boolean;
  collectionLevelOffer: boolean;
  protocol: TokenProtocols;
  paymentCoin: string;
  tokenAddress: string;
  seller: string;
  privateBuyer: string;
  buyer: string;
  delegatedPurchaser: string;
  marketplace: string;

  marketplaceFeeNumerator: BigNumberish;
  maxRoyaltyFeeNumerator: BigNumberish;
  listingNonce: BigNumberish;
  offerNonce: BigNumberish;
  listingMinPrice: BigNumberish;
  offerPrice: BigNumberish;
  listingExpiration: BigNumberish;
  offerExpiration: BigNumberish;
  tokenId: BigNumberish;
  amount: BigNumberish;

  sellerMasterNonce: BigNumberish;
  buyerMasterNonce: BigNumberish;

  listingSignature?: string;
  offerSignature?: string;
};

export type SaleApproval = {
  protocol: TokenProtocols;
  sellerAcceptedOffer: boolean;
  marketplace: string;
  marketplaceFeeNumerator: BigNumberish;
  maxRoyaltyFeeNumerator: BigNumberish;
  privateBuyer: string;
  seller: string;
  tokenAddress: string;
  tokenId: BigNumberish;
  amount: BigNumberish;
  minPrice: BigNumberish;
  expiration: BigNumberish;
  nonce: BigNumberish;
  masterNonce: BigNumberish;
  coin: string;
};

export type OfferApproval = {
  protocol: number;
  marketplace: string;
  marketplaceFeeNumerator: BigNumberish;
  delegatedPurchaser: string;
  buyer: string;
  tokenAddress: string;
  tokenId: BigNumberish;
  amount: BigNumberish;
  price: BigNumberish;
  expiration: BigNumberish;
  nonce: BigNumberish;
  masterNonce: BigNumberish;
  coin: string;
};
