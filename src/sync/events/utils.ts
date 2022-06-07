import { AddressZero } from "@ethersproject/constants";

import { baseProvider } from "@/common/provider";
import { getTransaction, saveTransaction } from "@/models/transactions";

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    const tx = await baseProvider.getTransaction(txHash);
    return saveTransaction({
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: tx.to?.toLowerCase() || AddressZero,
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
    });
  });
