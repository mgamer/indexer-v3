import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";
import { utils } from "ethers";

export const add: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-add",
  topic: utils.id("Add(uint256,uint256,uint256)"),
  numTopics: 4,
  abi: new Interface([
    `event Add(
        uint256 indexed baseTokenAmount, 
        uint256 indexed fractionalTokenAmount, 
        uint256 indexed lpTokenAmount
    )`,
  ]),
};

export const remove: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-remove",
  topic: utils.id("Remove(uint256,uint256,uint256)"),
  numTopics: 4,
  abi: new Interface([
    `event Remove(
        uint256 indexed baseTokenAmount, 
        uint256 indexed fractionalTokenAmount, 
        uint256 indexed lpTokenAmount
    )`,
  ]),
};

export const buy: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-buy",
  topic: utils.id("Buy(uint256,uint256)"),
  numTopics: 3,
  abi: new Interface([
    `event Buy(
        uint256 indexed inputAmount, 
        uint256 indexed outputAmount
    )`,
  ]),
};

export const sell: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-sell",
  topic: utils.id("Sell(uint256,uint256)"),
  numTopics: 3,
  abi: new Interface([
    `event Sell(
        uint256 indexed inputAmount, 
        uint256 indexed outputAmount
    )`,
  ]),
};

export const wrap: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-wrap",
  topic: utils.id("Wrap(uint256[])"),
  numTopics: 2,
  abi: new Interface([`event Wrap(uint256[] indexed tokenIds)`]),
};

export const unwrap: EventData = {
  kind: "caviar-v1",
  subKind: "caviar-v1-unwrap",
  topic: utils.id("Unwrap(uint256[])"),
  numTopics: 2,
  abi: new Interface([`event Unwrap(uint256[] indexed tokenIds)`]),
};
