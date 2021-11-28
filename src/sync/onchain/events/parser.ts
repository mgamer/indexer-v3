import { Log } from "@ethersproject/abstract-provider";

export type BaseParams = {
  address: string;
  block: number;
  blockHash: string;
  txHash: string;
  logIndex: number;
};

// Parse common params all events will be sharing
export const parseEvent = (log: Log): BaseParams => {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const logIndex = log.logIndex;

  return { address, txHash, block, blockHash, logIndex };
};
