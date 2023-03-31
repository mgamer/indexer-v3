import { Interface } from "@ethersproject/abi";
import { LooksRareV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const newBidAskNonces: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-new-bid-ask-nonces",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xb738dd6073fae1a7128e3fcc6b4ca6e1356b7232f87cc98f8a2857bcd83dfc44",
  numTopics: 1,
  abi: new Interface([
    `event NewBidAskNonces(
      address user, uint256 bidNonce,
      uint256 askNonce
    )`,
  ]),
};

export const orderNoncesCancelled: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-order-nonces-cancelled",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0560c6093fba8a508d0e6ea3b4d7260d7afa9b152731f03a2d05dfe39b0ec425",
  numTopics: 1,
  abi: new Interface([
    `event OrderNoncesCancelled(
      address user, 
      uint256[] orderNonces
    )`,
  ]),
};

export const subsetNoncesCancelled: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-subset-nonces-cancelled",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8036d6fb143373f3ff63e551373f5fffe4267f6809bf6d3934014a18a9b38f6",
  numTopics: 1,
  abi: new Interface([
    `event SubsetNoncesCancelled(
      address user, 
      uint256[] subsetNonces
    )`,
  ]),
};

export const takerAsk: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-taker-ask",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x98c5962eee7e03802f047eea0b762b96ced36c7780a5e14bb4d3c5ddef396518",
  numTopics: 1,
  abi: new Interface([
    `event TakerAsk(
      (
        bytes32 orderHash,
        uint256 orderNonce,
        bool isNonceInvalidated,
      ) nonceInvalidationParameters,
      address askUser,
      address bidUser,
      uint256 strategyId,
      address currency,
      address collection,
      uint256[] itemIds,
      uint256[] amounts,
      address[2] feeRecipients,
      uint256[3] feeAmounts
    )`,
  ]),
};

export const takerBid: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-taker-bid",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xd688d5ca2ade94d2463a0e13a8bc9cd490a2318f63b2b500129723f6a328b6b1",
  numTopics: 1,
  abi: new Interface([
    `event TakerBid(
      (
        bytes32 orderHash,
        uint256 orderNonce,
        bool isNonceInvalidated,
      ) nonceInvalidationParameters,
      address bidUser,
      address bidRecipient,
      uint256 strategyId,
      address currency,
      address collection,
      uint256[] itemIds,
      uint256[] amounts,
      address[2] feeRecipients,
      uint256[3] feeAmounts
    )`,
  ]),
};
