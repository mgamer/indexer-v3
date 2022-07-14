import { baseProvider } from "@/common/provider";
import { getTransaction, saveTransaction } from "@/models/transactions";
import { logger } from "@/common/logger";

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // Unfortunately, we need to make two calls
    const tx = await baseProvider.getTransaction(txHash);
    const txReceipt = await baseProvider.getTransactionReceipt(txHash);

    logger.info("debug", JSON.stringify(tx));
    logger.info("debug", JSON.stringify(txReceipt));

    return saveTransaction({
      hash: tx.hash.toLowerCase(),
      from: txReceipt.from.toLowerCase(),
      to: txReceipt.to.toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      blockTimestamp: tx.timestamp!,
      gasUsed: txReceipt.gasUsed.toString(),
      gasPrice: txReceipt.effectiveGasPrice.toString(),
      gasFee: txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString(),
    });
  });
