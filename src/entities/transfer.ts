import { db } from "@common/db";

type GetTransfersFilter = {
  contract: string;
  tokenId?: string;
  offset: number;
  limit: number;
};

export const getTransfers = async (filter: GetTransfersFilter) => {
  let baseQuery = `
    select
      "address",
      "token_id" as "tokenId",
      "from",
      "to",
      "amount",
      "tx_hash" as "txHash",
      "block"
    from "transfer_events"
  `;

  const conditions: string[] = [`"address" = $/contract/`];
  if (filter.tokenId) {
    conditions.push(`"token_id" = $/tokenId/`);
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.join(" and ");
  }

  baseQuery += ` order by "block" desc`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
