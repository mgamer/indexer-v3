import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const sell: EventData = {
  kind: "sudoswap-sell",
  topic: "0x3614eb567740a0ee3897c0e2b11ad6a5720d2e4438f9c8accf6c95c24af3a470",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair()`]),
};

export const buy: EventData = {
  kind: "sudoswap-buy",
  topic: "0xbc479dfc6cb9c1a9d880f987ee4b30fa43dd7f06aec121db685b67d587c93c93",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOuPair()`]),
};

export const tokenDeposit: EventData = {
  kind: "sudoswap-token-deposit",
  topic: "0xf1b3be8dace0fecfbdb6fb0fa1cc014c612bcb1b46db027c1ece5fc11fff09d6",
  numTopics: 1,
  abi: new Interface([`event TokenDeposit(uint256 amount)`]),
};

export const tokenWithdrawal: EventData = {
  kind: "sudoswap-token-withdrawal",
  topic: "0x0e266e8f38544aa1480d73762386eb10df55b1b8453d935762e891c44b69a1e6",
  numTopics: 1,
  abi: new Interface([`event TokenWithdrawal(uint256 amount)`]),
};
