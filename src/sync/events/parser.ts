import { Log } from "@ethersproject/abstract-provider";

import { toBuffer } from "@/common/utils";

export type BaseEventParams = {
  address: Buffer;
  block: number;
  blockHash: Buffer;
  txHash: Buffer;
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
  const address = toBuffer(log.address);
  const block = log.blockNumber;
  const blockHash = toBuffer(log.blockHash);
  const txHash = toBuffer(log.transactionHash);
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
