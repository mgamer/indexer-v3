import { redb, idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  data?: string;
};

export const saveTransaction = async (transaction: Transaction) => {
  await idb.none(
    `
      INSERT INTO transactions (
        hash,
        "from",
        "to",
        value,
        data
      ) VALUES (
        $/hash/,
        $/from/,
        $/to/,
        $/value/,
        $/data/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      hash: toBuffer(transaction.hash),
      from: toBuffer(transaction.from),
      to: toBuffer(transaction.to),
      value: transaction.value,
      data: transaction.data ? toBuffer(transaction.data) : null,
    }
  );

  return transaction;
};

export const getTransaction = async (hash: string): Promise<Transaction> => {
  const result = await redb.oneOrNone(
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
