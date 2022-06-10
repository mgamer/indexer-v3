import { Interface } from "@ethersproject/abi";
import { Seaport } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderCancelled: EventData = {
  kind: "seaport-order-cancelled",
  addresses: { [Seaport.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x6bacc01dbe442496068f7d234edd811f1a5f833243e0aec824f86ab861f3c90d",
  numTopics: 3,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 orderHash,
      address indexed offerer,
      address indexed zone
    )`,
  ]),
};

export const orderFulfilled: EventData = {
  kind: "seaport-order-filled",
  addresses: { [Seaport.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31",
  numTopics: 3,
  abi: new Interface([
    `event OrderFulfilled(
      bytes32 orderHash,
      address indexed offerer,
      address indexed zone,
      address recipient,
      (
        uint8 itemType,
        address token,
        uint256 identifier,
        uint256 amount
      )[] offer,
      (
        uint8 itemType,
        address token,
        uint256 identifier,
        uint256 amount,
        address recipient
      )[] consideration
  )`,
  ]),
};

export const nonceIncremented: EventData = {
  kind: "seaport-nonce-incremented",
  addresses: { [Seaport.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ab0fc7de8910a6100b24df423c3d0835534506dca9473d30c3e7df51241b2cf",
  numTopics: 2,
  abi: new Interface([
    `event NonceIncremented(
      uint256 newNonce,
      address indexed offerer
    )`,
  ]),
};
