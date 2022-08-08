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
      (address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice) ask
    )`,
  ]),
};

export const auctionEndedCoreEth: EventData = {
  kind: "zora-auction-ended-core-eth",
  addresses: { [Zora.Addresses.AuctionHouseCoreEth[config.chainId]?.toLowerCase()]: true },
  topic: "0xde4690ca69ca2f9bab030a05a3072d626b0692c7020c1ef534aa3cc140fb1ff5",
  numTopics: 3,
  abi: new Interface([
    `event AuctionEnded(
      address indexed tokenContract, 
      uint256 indexed tokenId, 
      (
        address seller,
        uint96 reservePrice,
        address sellerFundsRecipient,
        uint96 highestBid,
        address highestBidder,
        uint32 duration,
        uint32 startTime,
        uint32 firstBidTime
        ) auction
      )`,
  ]),
};

export const auctionEndedCoreErc20: EventData = {
  kind: "zora-auction-ended-core-erc20",
  addresses: { [Zora.Addresses.AuctionHouseCoreErc20[config.chainId]?.toLowerCase()]: true },
  topic: "0x84042a9c30febd3a9f01ec941c4468830c511bca38f54ca7cb0d39e0c509f387",
  numTopics: 3,
  abi: new Interface([
    `event AuctionEnded(
      address indexed tokenContract, 
      uint256 indexed tokenId, 
      (
        address seller,
        uint96 reservePrice,
        address sellerFundsRecipient,
        uint96 highestBid,
        address highestBidder,
        uint48 duration,
        uint48 startTime,
        address currency,
        uint96 firstBidTime
        ) auction
      )`,
  ]),
};
