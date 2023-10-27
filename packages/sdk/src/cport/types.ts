// export enum OrderProtocols {
//   ERC721_FILL_OR_KILL,
//   ERC1155_FILL_OR_KILL,
//   ERC1155_FILL_PARTIAL,
// }

// export enum PaymentSettings {
//   DefaultPaymentMethodWhitelist,
//   AllowAnyPaymentMethod,
//   CustomPaymentMethodWhitelist,
//   PricingConstraints,
// }

// // export type OrderKind =
// //   | "sale-approval"
// //   | "offer-approval"
// //   | "collection-offer-approval"
// //   | "bundled-offer-approval";

// export type SignatureECDSA = {
//   v: number;
//   r: string;
//   s: string;
// };

// export type Cosignature = {
//   signer: string;
//   taker: string;
//   expiration: string;
//   v: number;
//   r: string;
//   s: string;
// };

// export type MatchedOrder = {
//   protocol: OrderProtocols;
//   maker: string;
//   beneficiary: string;
//   marketplace: string;
//   paymentMethod: string;
//   tokenAddress: string;
//   tokenId: string;
//   amount: string;
//   itemPrice: string;
//   nonce: string;
//   expiration: string;
//   marketplaceFeeNumerator: string;
//   maxRoyaltyFeeNumerator: string;
//   requestedFillAmount: string;
//   minimumFillAmount: string;

//   // sellerAcceptedOffer: boolean;
//   // collectionLevelOffer: boolean;
//   // protocol: TokenProtocols;
//   // paymentCoin: string;
//   // tokenAddress: string;
//   // seller: string;
//   // privateBuyer: string;
//   // buyer: string;
//   // delegatedPurchaser: string;
//   // marketplace: string;
//   // marketplaceFeeNumerator: string;
//   // maxRoyaltyFeeNumerator: string;
//   // listingNonce: string;
//   // offerNonce: string;
//   // listingMinPrice: string;
//   // offerPrice: string;
//   // listingExpiration: string;
//   // offerExpiration: string;
//   // tokenId: string;
//   // amount: string;
//   // listingSignature: Signature;
//   // offerSignature: Signature;
// };

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

// export type BaseOrder = {
//   kind?: OrderKind;
//   protocol: number;
//   marketplace: string;
//   marketplaceFeeNumerator: string;
//   tokenAddress: string;
//   tokenId?: string;
//   amount: string;
//   price: string;
//   expiration: string;
//   nonce: string;
//   masterNonce: string;
//   coin: string;
//   privateBuyerOrDelegatedPurchaser: string;
//   sellerOrBuyer: string;
//   sellerAcceptedOffer: boolean;
//   maxRoyaltyFeeNumerator: string;
//   collectionLevelOffer: boolean;

//   // For bundled offers only
//   tokenIds?: string[];
//   amounts?: string[];
//   itemSalePrices?: string[];

//   v?: number;
//   r?: string;
//   s?: string;
// };

// // export type SaleApproval = {
// //   protocol: TokenProtocols;
// //   sellerAcceptedOffer: boolean;
// //   marketplace: string;
// //   marketplaceFeeNumerator: string;
// //   maxRoyaltyFeeNumerator: string;
// //   privateBuyer: string;
// //   seller: string;
// //   tokenAddress: string;
// //   tokenId: string;
// //   amount: string;
// //   minPrice: string;
// //   expiration: string;
// //   nonce: string;
// //   masterNonce: string;
// //   coin: string;
// // };

// // ItemOfferApproval(
// //   uint8 protocol,
// //   address buyer,
// //   address beneficiary,
// //   address marketplace,
// //   address paymentMethod,
// //   address tokenAddress,
// //   uint256 tokenId,
// //   uint256 amount,
// //   uint256 itemPrice,
// //   uint256 expiration,
// //   uint256 marketplaceFeeNumerator,
// //   uint256 nonce,
// //   uint256 masterNonce
// // )

// export type ItemOfferApproval = {
//   protocol: number;
//   marketplace: string;
//   marketplaceFeeNumerator: string;
//   delegatedPurchaser: string;
//   buyer: string;
//   tokenAddress: string;
//   tokenId: string;
//   amount: string;
//   price: string;
//   expiration: string;
//   nonce: string;
//   masterNonce: string;
//   coin: string;
// };

// // export type CollectionOfferApproval = {
// //   protocol: number;
// //   collectionLevelOffer: boolean;
// //   marketplace: string;
// //   marketplaceFeeNumerator: string;
// //   delegatedPurchaser: string;
// //   buyer: string;
// //   tokenAddress: string;
// //   amount: string;
// //   price: string;
// //   expiration: string;
// //   nonce: string;
// //   masterNonce: string;
// //   coin: string;
// // };

// // export type BundledOfferApproval = {
// //   protocol: number;
// //   marketplace: string;
// //   marketplaceFeeNumerator: string;
// //   delegatedPurchaser: string;
// //   buyer: string;
// //   tokenAddress: string;
// //   price: string;
// //   expiration: string;
// //   nonce: string;
// //   masterNonce: string;
// //   coin: string;
// //   tokenIds: string[];
// //   amounts: string[];
// //   itemSalePrices: string[];
// // };
