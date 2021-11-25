import { db } from "@/common/db";

export type GetTransfersFilter = {
  contract?: string;
  tokenId?: string;
  account?: string;
  direction?: "from" | "to";
  type?: "transfer" | "sale";
  offset: number;
  limit: number;
};

export const getTransfers = async (filter: GetTransfersFilter) => {
  let baseQuery = `
    select
      "te"."address" as "contract",
      "te"."token_id" as "tokenId",
      "te"."from",
      "te"."to",
      "te"."amount",
      "te"."tx_hash" as "txHash",
      "te"."block",
      "fe"."price"
    from "transfer_events" "te"
    left join "fill_events" "fe"
      on "te"."tx_hash" = "fe"."tx_hash"
      and "te"."from" = "fe"."maker"
  `;

  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"te"."address" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"te"."token_id" = $/tokenId/`);
  }
  if (filter.account) {
    if (filter.direction === "from") {
      conditions.push(`"te"."from" = $/account/`);
    } else if (filter.direction === "to") {
      conditions.push(`"te"."to" = $/account/`);
    } else {
      conditions.push(`"te"."from" = $/account/ or "te"."to" = $/account/`);
    }
  }
  if (filter.type) {
    if (filter.type === "transfer") {
      conditions.push(`"fe"."price" is null`);
    } else if (filter.type === "sale") {
      conditions.push(`"fe"."price" is not null`);
    }
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "te"."block" desc`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
