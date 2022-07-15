import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  blockNumber: number;
  blockTimestamp: number;
};

export const saveTransaction = async (transaction: Transaction) => {
  await idb.none(
    `
      INSERT INTO transactions (
        hash,
        "from",
        "to",
        value,
        data,
        block_number,
        block_timestamp
      ) VALUES (
        $/hash/,
        $/from/,
        $/to/,
        $/value/,
        $/data/,
        $/blockNumber/,
        $/blockTimestamp/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      hash: toBuffer(transaction.hash),
      from: toBuffer(transaction.from),
      to: toBuffer(transaction.to),
      value: transaction.value,
      data: toBuffer(transaction.data),
      blockNumber: transaction.blockNumber,
      blockTimestamp: transaction.blockTimestamp,
    }
  );

  return transaction;
};

export const getTransaction = async (
  hash: string
): Promise<Pick<Transaction, "hash" | "from" | "to" | "value">> => {
  const result = await idb.one(
    `
      SELECT
        transactions.from,
        transactions.to,
        transactions.value
      FROM transactions
      WHERE transactions.hash = $/hash/
    `,
    { hash: toBuffer(hash) }
  );

  return {
    hash,
    from: fromBuffer(result.from),
    to: fromBuffer(result.to),
    value: result.value,
  };
};
