import { Interface } from "@ethersproject/abi";
import { BlurV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const execution: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xcc059ef0eaf5066aaabfe1db113c5108154eb2e5d9a1c6a245968d5b312df313",
  numTopics: 1,
  abi: new Interface([
    `event Execution(
        Transfer transfer,
        bytes32 orderHash,
        uint256 listingIndex,
        uint256 price,
        FeeRate makerFee,
        Fees fees,
        OrderType orderType
    )`,
  ]),
};

export const execution721Packed: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1d5e12b51dee5e4d34434576c3fb99714a85f57b0fd546ada4b0bddd736d12b2",
  numTopics: 1,
  abi: new Interface([
    `event Execution721Packed(
        bytes32 orderHash,
        uint256 tokenIdListingIndexTrader,
        uint256 collectionPriceSide
    )`,
  ]),
};

export const execution721TakerFeePacked: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-taker-fee-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0fcf17fac114131b10f37b183c6a60f905911e52802caeeb3e6ea210398b81ab",
  numTopics: 1,
  abi: new Interface([
    `event Execution721TakerFeePacked(
        bytes32 orderHash,
        uint256 tokenIdListingIndexTrader,
        uint256 collectionPriceSide,
        uint256 takerFeeRecipientRate
    )`,
  ]),
};

export const execution721MakerFeePacked: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-maker-fee-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x7dc5c0699ac8dd5250cbe368a2fc3b4a2daadb120ad07f6cccea29f83482686e",
  numTopics: 1,
  abi: new Interface([
    `event Execution721MakerFeePacked(
        bytes32 orderHash,
        uint256 tokenIdListingIndexTrader,
        uint256 collectionPriceSide,
        uint256 makerFeeRecipientRate
    )`,
  ]),
};

// console.log('execution721Packed', execution721Packed.abi.getEventTopic('Execution721Packed'))
// console.log('execution721TakerFeePacked', execution721TakerFeePacked.abi.getEventTopic('Execution721TakerFeePacked'))
// console.log('execution721MakerFeePacked', execution721MakerFeePacked.abi.getEventTopic('Execution721MakerFeePacked'))
