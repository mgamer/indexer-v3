import { Interface } from "@ethersproject/abi";
import { WyvernV23 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderCancelled: EventData = {
  kind: "wyvern-v2.3-order-cancelled",
  addresses: { [WyvernV23.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",
  numTopics: 2,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 indexed hash
    )`,
  ]),
};

export const ordersMatched: EventData = {
  kind: "wyvern-v2.3-orders-matched",
  addresses: { [WyvernV23.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xc4109843e0b7d514e4c093114b863f8e7d8d9a458c372cd51bfe526b588006c9",
  numTopics: 4,
  abi: new Interface([
    `event OrdersMatched(
      bytes32 buyHash,
      bytes32 sellHash,
      address indexed maker,
      address indexed taker,
      uint256 price,
      bytes32 indexed metadata
    )`,
  ]),
};

export const nonceIncremented: EventData = {
  kind: "wyvern-v2.3-nonce-incremented",
  addresses: { [WyvernV23.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xa82a649bbd060c9099cd7b7326e2b0dc9e9af0836480e0f849dc9eaa79710b3b",
  numTopics: 2,
  abi: new Interface([
    `event NonceIncremented(
      address indexed maker,
      uint256 newNonce
    )`,
  ]),
};
