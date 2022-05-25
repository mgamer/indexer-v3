import { Interface } from "@ethersproject/abi";
import { Common } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const transfer: EventData = {
  kind: "erc20-transfer",
  addresses: { [Common.Addresses.Weth[config.chainId]?.toLowerCase()]: true },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 amount
    )`,
  ]),
};

export const deposit: EventData = {
  kind: "weth-deposit",
  addresses: { [Common.Addresses.Weth[config.chainId]?.toLowerCase()]: true },
  topic: "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
  numTopics: 2,
  abi: new Interface([
    `event Deposit(
      address indexed to,
      uint256 amount
    )`,
  ]),
};

export const withdrawal: EventData = {
  kind: "weth-withdrawal",
  addresses: { [Common.Addresses.Weth[config.chainId]?.toLowerCase()]: true },
  topic: "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",
  numTopics: 2,
  abi: new Interface([
    `event Withdrawal(
      address indexed from,
      uint256 amount
    )`,
  ]),
};
