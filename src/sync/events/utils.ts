import { AddressZero } from "@ethersproject/constants";
import pLimit from "p-limit";

import { baseProvider, slowProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { getBlocks, saveBlock } from "@/models/blocks";
import { Sources } from "@/models/sources";
import { getTransaction, saveTransaction } from "@/models/transactions";

export const fetchBlock = async (blockNumber: number, force = false) =>
  getBlocks(blockNumber)
    // Only fetch a single block (multiple ones might be available due to reorgs)
    .then(async (blocks) => {
      if (blocks.length && !force) {
        return blocks[0];
      } else {
        const block = await baseProvider.getBlockWithTransactions(blockNumber);

        // Save all transactions within the block
        const limit = pLimit(20);
        await Promise.all(
          block.transactions.map((tx) =>
            limit(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawTx = tx.raw as any;

              const gasPrice = tx.gasPrice?.toString();
              const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
              const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

              await saveTransaction({
                hash: tx.hash.toLowerCase(),
                from: tx.from.toLowerCase(),
                to: (tx.to || AddressZero).toLowerCase(),
                value: tx.value.toString(),
                data: tx.data.toLowerCase(),
                blockNumber: block.number,
                blockTimestamp: block.timestamp,
                gasPrice,
                gasUsed,
                gasFee,
              });
            })
          )
        );

        return saveBlock({
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
        });
      }
    });

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // TODO: This should happen very rarely since all transactions
    // should be readily available. The only case when data misses
    // is when a block reorg happens and the replacing block takes
    // in transactions that were missing in the previous block. In
    // this case we don't refetch the new block's transactions but
    // assume it cannot include new transactions. But that's not a
    // a good assumption so we should force re-fetch the new block
    // together with its transactions when a reorg happens.

    let tx = await baseProvider.getTransaction(txHash);
    if (!tx) {
      tx = await slowProvider.getTransaction(txHash);
    }

    // Also fetch all transactions within the block
    const blockTimestamp = (await fetchBlock(tx.blockNumber!, true)).timestamp;

    // TODO: Fetch gas fields via `eth_getTransactionReceipt`
    // Sometimes `effectiveGasPrice` can be null
    // const txReceipt = await baseProvider.getTransactionReceipt(txHash);
    // const gasPrice = txReceipt.effectiveGasPrice || tx.gasPrice || 0;

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
  });

export const getOrderSourceByOrderKind = async (orderKind: string): Promise<number | null> => {
  try {
    const sources = await Sources.getInstance();

    switch (orderKind) {
      case "x2y2":
        return sources.getByDomain("x2y2.io").id;
      case "foundation":
        return sources.getByDomain("foundation.app").id;
      case "looks-rare":
        return sources.getByDomain("looksrare.org").id;
      case "seaport":
      case "wyvern-v2":
      case "wyvern-v2.3":
        return sources.getByDomain("opensea.io").id;
      default:
        // For all other order kinds we cannot default the source
        return null;
    }
  } catch (error) {
    return null;
  }
};
