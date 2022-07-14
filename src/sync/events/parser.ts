import { Log } from "@ethersproject/abstract-provider";

import { Block } from "@/models/blocks";
import { fetchBlock } from "./utils";

export type BaseEventParams = {
  address: string;
  block: number;
  blockHash: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  timestamp: number;
  batchIndex: number;
};

export const parseEvent = async (
  log: Log,
  blocksCache: Map<number, Block>,
  batchIndex = 1
): Promise<BaseEventParams> => {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;

  let cache = blocksCache.get(block);
  if (!cache) {
    cache = await fetchBlock(block);
    blocksCache.set(block, cache);
  }

  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp: cache.timestamp,
    batchIndex,
  };
};
