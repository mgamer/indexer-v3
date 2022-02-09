import { Log } from "@ethersproject/abstract-provider";

export type BaseEventParams = {
  address: string;
  block: number;
  blockHash: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  timestamp: number;
};

export const parseEvent = (
  log: Log,
  blockRange: {
    from: {
      block: number;
      timestamp: number;
    };
    to: {
      block: number;
      timestamp: number;
    };
  }
): BaseEventParams => {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;

  // Estimate the event block's timestamp
  const { from, to } = blockRange;
  let timestamp: number;
  if (block === from.block) {
    timestamp = from.timestamp;
  } else if (block === to.block) {
    timestamp = to.timestamp;
  } else {
    const averageBlockTime =
      (to.timestamp - from.timestamp) / (to.block - from.block);
    timestamp =
      from.timestamp + Math.round(averageBlockTime * (block - from.block));
  }

  return { address, txHash, txIndex, block, blockHash, logIndex, timestamp };
};
