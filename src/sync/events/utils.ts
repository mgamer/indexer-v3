import { AddressZero } from "@ethersproject/constants";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { getBlocks, saveBlock } from "@/models/blocks";
import { getTransaction, saveTransaction } from "@/models/transactions";

export const fetchBlock = async (blockNumber: number) =>
  getBlocks(blockNumber)
    // Only fetch a single block (multiple ones might be available due to reorgs)
    .then((b) => b[0])
    .catch(async () => {
      const block = await baseProvider.getBlock(blockNumber);
      return saveBlock({
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
      });
    });

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // In order to get all transaction fields we need to make two calls:
    // - `eth_getTransactionByHash`
    // - `eth_getTransactionReceipt`

    const tx = await baseProvider.getTransaction(txHash);
    const blockTimestamp = (await fetchBlock(tx.blockNumber!)).timestamp;

    // TODO: Fetch gas fields via `eth_getTransactionReceipt`
    // Sometimes `effectiveGasPrice` can be null
    // const txReceipt = await baseProvider.getTransactionReceipt(txHash);
    // const gasPrice = txReceipt.effectiveGasPrice || tx.gasPrice || 0;

    try {
      return saveTransaction({
        hash: tx.hash.toLowerCase(),
        from: tx.from.toLowerCase(),
        to: (tx.to || AddressZero).toLowerCase(),
        value: tx.value.toString(),
        data: tx.data.toLowerCase(),
        blockNumber: tx.blockNumber!,
        blockTimestamp,
        // gasUsed: txReceipt.gasUsed.toString(),
        // gasPrice: gasPrice.toString(),
        // gasFee: txReceipt.gasUsed.mul(gasPrice).toString(),
      });
    } catch (error) {
      logger.info("debug", JSON.stringify({ tx }));
      throw error;
    }
  });
