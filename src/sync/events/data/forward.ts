import { Interface } from "@ethersproject/abi";
import { Forward } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderFilled: EventData = {
  kind: "forward-order-filled",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf69762fa159688f7cf5a8c379cf161c98ad673556144e57a0a5412824f9bcfae",
  numTopics: 1,
  abi: new Interface([
    `event OrderFilled(
      bytes32 orderHash,
      uint8 side,
      uint8 itemKind,
      address maker,
      address taker,
      address token,
      uint256 identifier,
      uint256 unitPrice,
      uint128 amount
    )`,
  ]),
};

export const orderCancelled: EventData = {
  kind: "forward-order-cancelled",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",
  numTopics: 1,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 orderHash
    )`,
  ]),
};

export const counterIncremented: EventData = {
  kind: "forward-counter-incremented",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x59950fb23669ee30425f6d79758e75fae698a6c88b2982f2980638d8bcd9397d",
  numTopics: 1,
  abi: new Interface([
    `event CounterIncremented(
      address maker,
      uint256 newCounter
    )`,
  ]),
};
