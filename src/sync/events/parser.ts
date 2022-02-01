import { Log } from "@ethersproject/abstract-provider";

export type BaseEventParams = {
  address: Buffer;
  block: number;
  blockHash: Buffer;
  txHash: Buffer;
  txIndex: number;
  logIndex: number;
};

export const parseEvent = (log: Log): BaseEventParams => {
  const address = Buffer.from(log.address.slice(2), "hex");
  const block = log.blockNumber;
  const blockHash = Buffer.from(log.blockHash.slice(2), "hex");
  const txHash = Buffer.from(log.transactionHash.slice(2), "hex");
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;

  return { address, txHash, txIndex, block, blockHash, logIndex };
};
