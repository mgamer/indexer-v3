import { Interface } from "@ethersproject/abi";
import { PaymentProcessor } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const buySingleListing: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-buy-single-listing",
  addresses: { [PaymentProcessor.Addresses.PaymentProcessor[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 4,
  abi: new Interface([
    `event BuySingleListing(
        address indexed marketplace,
        address indexed tokenAddress,
        address indexed paymentCoin,
        address buyer,
        address seller,
        uint256 tokenId,
        uint256 amount,
        uint256 salePrice
    )`,
  ]),
};

export const sweepCollectionERC721: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-sweep-collection-erc721",
  addresses: { [PaymentProcessor.Addresses.PaymentProcessor[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 4,
  abi: new Interface([
    `event SweepCollectionERC721(
      address indexed marketplace,
      address indexed tokenAddress,
      address indexed paymentCoin,
      address buyer,
      bool[] unsuccessfulFills,
      address[] sellers,
      uint256[] tokenIds,
      uint256[] salePrices
    )`,
  ]),
};

export const sweepCollectionERC1155: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-sweep-collection-erc1155",
  addresses: { [PaymentProcessor.Addresses.PaymentProcessor[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 4,
  abi: new Interface([
    `event SweepCollectionERC1155(
      address indexed marketplace,
      address indexed tokenAddress,
      address indexed paymentCoin,
      address buyer,
      bool[] unsuccessfulFills,
      address[] sellers,
      uint256[] tokenIds,
      uint256[] amounts,
      uint256[] salePrices)`,
  ]),
};

export const masterNonceInvalidated: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-master-nonce-invalidated",
  addresses: { [PaymentProcessor.Addresses.PaymentProcessor[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 3,
  abi: new Interface([
    `event MasterNonceInvalidated(uint256 indexed nonce, address indexed account)`,
  ]),
};

export const nonceInvalidated: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-nonce-invalidated",
  addresses: { [PaymentProcessor.Addresses.PaymentProcessor[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 4,
  abi: new Interface([
    `event NonceInvalidated(
      uint256 indexed nonce, 
      address indexed account, 
      address indexed marketplace, 
      bool wasCancellation
    )`,
  ]),
};
