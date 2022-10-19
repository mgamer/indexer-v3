import { Interface } from "@ethersproject/abi";
import { Blur } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const ordersMatched: EventData = {
  kind: "blur-orders-matched",
  addresses: { [Blur.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x61cbb2a3dee0b6064c2e681aadd61677fb4ef319f0b547508d495626f5a62f64",
  numTopics: 3,
  abi: new Interface([
    `event OrdersMatched(
      address indexed maker,
      address indexed taker,
      (
        address trader,
        uint8 side,
        address matchingPolicy,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 listingTime,
        uint256 expirationTime,
        (
          uint16 rate,
          address recipient
        )[] fees,
        uint256 salt,
        bytes extraParams
      ) sell,
      bytes32 sellHash,
      (
        address trader,
        uint8 side,
        address matchingPolicy,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 listingTime,
        uint256 expirationTime,
        (
          uint16 rate,
          address recipient
        )[] fees,
        uint256 salt,
        bytes extraParams
      ) buy,
      bytes32 buyHash
    )`,
  ]),
};
