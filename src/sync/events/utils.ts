import { baseProvider } from "@/common/provider";
import { getTransaction, saveTransaction } from "@/models/transactions";

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // Unfortunately we need to make two calls
    const tx = await baseProvider.getTransaction(txHash);
    const txReceipt = await baseProvider.getTransactionReceipt(txHash);

    // Sometimes `effectiveGasPrice` can be null
    const gasPrice = txReceipt.effectiveGasPrice || tx.gasPrice || 0;

    return saveTransaction({
      hash: tx.hash.toLowerCase(),
      from: txReceipt.from.toLowerCase(),
      to: txReceipt.to.toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: txReceipt.blockNumber,
      blockTimestamp: tx.timestamp!,
      gasUsed: txReceipt.gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      gasFee: txReceipt.gasUsed.mul(gasPrice).toString(),
    });
  });
