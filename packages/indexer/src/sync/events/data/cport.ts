import { Interface } from "@ethersproject/abi";
import { CPort } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const buyListingERC721: EventData = {
  kind: "cport",
  subKind: "cport-buy-listing-erc721",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xffb29e9cf48456d56b6d414855b66a7ec060ce2054dcb124a1876310e1b7355c",
  numTopics: 4,
  abi: new Interface([
    `event BuyListingERC721(
      address indexed buyer,
      address indexed seller,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 salePrice
    )`,
  ]),
};

export const buyListingERC1155: EventData = {
  kind: "cport",
  subKind: "cport-buy-listing-erc1155",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1217006325a98bdcc6afc9c44965bb66ac7460a44dc57c2ac47622561d25c45a",
  numTopics: 4,
  abi: new Interface([
    `event BuyListingERC1155(
      address indexed buyer,
      address indexed seller,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 amount,
      uint256 salePrice
    )`,
  ]),
};

export const acceptOfferERC721: EventData = {
  kind: "cport",
  subKind: "cport-accept-offer-erc721",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8b87c0b049fe52718fe6ff466b514c5a93c405fb0de8fbd761a23483f9f9e198",
  numTopics: 4,
  abi: new Interface([
    `event AcceptOfferERC721(
      address indexed seller,
      address indexed buyer,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 salePrice
    )`,
  ]),
};

export const acceptOfferERC1155: EventData = {
  kind: "cport",
  subKind: "cport-accept-offer-erc1155",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x6f4c56c4b9a9d2479f963d802b19d17b02293ce1225461ac0cb846c482ee3c3e",
  numTopics: 4,
  abi: new Interface([
    `event AcceptOfferERC1155(
      address indexed seller,
      address indexed buyer,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 amount,
      uint256 salePrice
    )`,
  ]),
};

export const masterNonceInvalidated: EventData = {
  kind: "cport",
  subKind: "cport-master-nonce-invalidated",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xb06d2760711c1c15c05bc011b1009a36c0713c6d63567c267678c3a382188b61",
  numTopics: 3,
  abi: new Interface([
    `event MasterNonceInvalidated(uint256 indexed nonce, address indexed account)`,
  ]),
};

export const nonceInvalidated: EventData = {
  kind: "cport",
  subKind: "cport-nonce-invalidated",
  addresses: { [CPort.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf3003920635c7d35c4f314eaeeed4b4c653ccb36608a86d57df761d460eab09d",
  numTopics: 4,
  abi: new Interface([
    `event NonceInvalidated(
      uint256 indexed nonce, 
      address indexed account, 
      bool wasCancellation
    )`,
  ]),
};

// console.log("nonceInvalidated", nonceInvalidated.abi.getEventTopic("NonceInvalidated"));
// console.log(
//   "masterNonceInvalidated",
//   masterNonceInvalidated.abi.getEventTopic("MasterNonceInvalidated")
// );
// console.log("buyListingERC721", buyListingERC721.abi.getEventTopic("BuyListingERC721"));
// console.log("buyListingERC1155", buyListingERC1155.abi.getEventTopic("BuyListingERC1155"));
// console.log("acceptOfferERC721", acceptOfferERC721.abi.getEventTopic("AcceptOfferERC721"));
// console.log("acceptOfferERC1155", acceptOfferERC1155.abi.getEventTopic("AcceptOfferERC1155"));

// export const createdOrUpdatedSecurityPolicy: EventData = {
//   kind: "payment-processor",
//   subKind: "payment-processor-created-or-updated-security-policy",
//   addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
//   topic: "0xfa0f19ecb97e973eefa78c4ef4f6be467d4e0d320b88fa6b3e785f09df7089f6",
//   numTopics: 2,
//   abi: new Interface([
//     `event CreatedOrUpdatedSecurityPolicy(
//       uint256 indexed securityPolicyId,
//       bool enforceExchangeWhitelist,
//       bool enforcePaymentMethodWhitelist,
//       bool enforcePricingConstraints,
//       bool disablePrivateListings,
//       bool disableDelegatedPurchases,
//       bool disableEIP1271Signatures,
//       bool disableExchangeWhitelistEOABypass,
//       uint32 pushPaymentGasLimit,
//       string policyName
//     )`,
//   ]),
// };

// export const updatedCollectionPaymentCoin: EventData = {
//   kind: "payment-processor",
//   subKind: "payment-processor-updated-collection-payment-coin",
//   addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
//   topic: "0x53ab061e9517daf6849d4bde07950e3d199f73115c2e4842a8b20a62e83abd1c",
//   numTopics: 3,
//   abi: new Interface([
//     `event UpdatedCollectionPaymentCoin(address indexed tokenAddress, address indexed paymentCoin)`,
//   ]),
// };

// export const updatedCollectionSecurityPolicy: EventData = {
//   kind: "payment-processor",
//   subKind: "payment-processor-updated-collection-security-policy",
//   addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
//   topic: "0x8a2e423ccab4754dc61747d26d19bc14c55577d5fcc54b4a67d9b82a016b61df",
//   numTopics: 3,
//   abi: new Interface([
//     `event UpdatedCollectionSecurityPolicy(address indexed tokenAddress, uint256 indexed securityPolicyId)`,
//   ]),
// };
