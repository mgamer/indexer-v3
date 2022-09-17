import { Interface } from "@ethersproject/abi";
import { Zora } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const askFilled: EventData = {
  kind: "zora-ask-filled",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x21a9d8e221211780696258a05c6225b1a24f428e2fd4d51708f1ab2be4224d39",
  numTopics: 4,
  abi: new Interface([
    `event AskFilled(
      address indexed tokenContract,
      uint256 indexed tokenId,
      address indexed buyer,
      address finder,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
  ]),
};

export const auctionEnded: EventData = {
  kind: "zora-auction-ended",
  addresses: { [Zora.Addresses.AuctionHouse[config.chainId]?.toLowerCase()]: true },
  topic: "0x4f35fb3ea0081b3ccbe8df613cab0f9e1694d50a025e0aa09b88a86a3d07c2de",
  numTopics: 4,
  abi: new Interface([
    `event AuctionEnded(
      uint256 indexed auctionId,
      uint256 indexed tokenId,
      address indexed tokenContract,
      address tokenOwner,
      address curator,
      address winner,
      uint256 amount,
      uint256 curatorFee,
      address auctionCurrency
    )`,
  ]),
};

const askCreatedABI = new Interface([
  `event AskCreated(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
]);

export const askCreated: EventData = {
  kind: "zora-ask-created",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: Interface.getEventTopic(askCreatedABI.getEvent("AskCreated")),
  numTopics: 3,
  abi: askCreatedABI,
};

const askPriceUpdatedABI = new Interface([
  `event AskPriceUpdated(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
]);

export const askPriceUpdated: EventData = {
  kind: "zora-ask-price-updated",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: Interface.getEventTopic(askPriceUpdatedABI.getEvent("AskPriceUpdated")),
  numTopics: 3,
  abi: askPriceUpdatedABI,
};

const askCanceledABI = new Interface([
  `event AskCanceled(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
]);

export const askCanceled: EventData = {
  kind: "zora-ask-canceled",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: Interface.getEventTopic(askCanceledABI.getEvent("AskCanceled")),
  numTopics: 3,
  abi: askCanceledABI,
};

// console.log('askCanceled', askCanceled)
