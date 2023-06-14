import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const add: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-add",
  topic: "Add(uint256,uint256,uint256)",
  numTopics: 1,
  abi: new Interface([
    `Add(uint256 indexed baseTokenAmount, uint256 indexed fractionalTokenAmount, uint256 indexed lpTokenAmount)`,
  ]),
};

export const remove: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-remove",
  topic: "Remove(uint256,uint256,uint256)",
  numTopics: 1,
  abi: new Interface([
    `Remove(uint256 indexed baseTokenAmount, uint256 indexed fractionalTokenAmount, uint256 indexed lpTokenAmount)`,
  ]),
};

export const buy: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-buy",
  topic: "Buy(uint256,uint256)",
  numTopics: 1,
  abi: new Interface([`Buy(uint256 indexed inputAmount, uint256 indexed outputAmount)`]),
};

export const sell: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-sell",
  topic: "Sell(uint256,uint256)",
  numTopics: 1,
  abi: new Interface([`Sell(uint256 indexed inputAmount, uint256 indexed outputAmount)`]),
};

export const wrap: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-wrap",
  topic: "Wrap(uint256[])",
  numTopics: 1,
  abi: new Interface([`Wrap(uint256[] indexed tokenIds)`]),
};

export const unwrap: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-unwrap",
  topic: "Unwrap(uint256[])",
  numTopics: 1,
  abi: new Interface([`Unwrap(uint256[] indexed tokenIds)`]),
};
