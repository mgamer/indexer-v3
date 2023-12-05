import { Log } from "@ethersproject/abstract-provider";

export type BaseEventParams = {
  address: string;
  block: number;
  blockHash: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  timestamp: number;
  batchIndex: number;
  from: string;
};

export const parseEvent = (
  log: Log,
  timestamp: number,
  batchIndex = 1,
  txData: {
    from: string;
  }
): BaseEventParams => {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;
  const from = txData?.from?.toLowerCase();

  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp,
    batchIndex,
    from,
  };
};
