import { baseProvider } from "@/common/provider";
import { getBlocks, saveBlock } from "@/models/blocks";
import { getTransaction, saveTransaction } from "@/models/transactions";
import { logger } from "@/common/logger";

export const fetchBlock = async (blockNumber: number) =>
  getBlocks(blockNumber)
    // Only fetch a single block
    .then((b) => b[0])
    .catch(async () => {
      const block = await baseProvider.getBlock(blockNumber);
      logger.info("fetch-block", JSON.stringify(block));
      return saveBlock({
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
      });
    });

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // Unfortunately we need to make two calls
    const tx = await baseProvider.getTransaction(txHash);
    const txReceipt = await baseProvider.getTransactionReceipt(txHash);
    const blockTimestamp = (await fetchBlock(txReceipt.blockNumber)).timestamp;

    // Sometimes `effectiveGasPrice` can be null
    const gasPrice = txReceipt.effectiveGasPrice || tx.gasPrice || 0;

    return saveTransaction({
      hash: tx.hash.toLowerCase(),
      from: txReceipt.from.toLowerCase(),
      to: txReceipt.to.toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      blockTimestamp,
      gasUsed: txReceipt.gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      gasFee: txReceipt.gasUsed.mul(gasPrice).toString(),
    });
  });
