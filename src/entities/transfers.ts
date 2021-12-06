import { db } from "@/common/db";

export type GetTransfersFilter = {
  contract?: string;
  tokenId?: string;
  account?: string;
  direction?: "from" | "to";
  type?: "transfer" | "sale";
  attributes?: { [key: string]: string };
  offset: number;
  limit: number;
};

export const getTransfers = async (filter: GetTransfersFilter) => {
  let baseQuery = `
    select
      "nte"."address" as "contract",
      "nte"."token_id" as "tokenId",
      "nte"."from",
      "nte"."to",
      "nte"."amount",
      "nte"."tx_hash" as "txHash",
      "nte"."block",
      "fe"."price"
    from "nft_transfer_events" "nte"
    left join "fill_events" "fe"
      on "nte"."tx_hash" = "fe"."tx_hash"
      and "nte"."from" = "fe"."maker"
  `;

  const conditions: string[] = [];
  if (filter.contract) {
    conditions.push(`"nte"."address" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"nte"."token_id" = $/tokenId/`);
  }
  if (filter.account) {
    if (filter.direction === "from") {
      conditions.push(`"nte"."from" = $/account/`);
    } else if (filter.direction === "to") {
      conditions.push(`"nte"."to" = $/account/`);
    } else {
      conditions.push(`"nte"."from" = $/account/ or "nte"."to" = $/account/`);
    }
  }
  if (filter.type === "transfer") {
    conditions.push(`"fe"."price" is null`);
  } else if (filter.type === "sale") {
    conditions.push(`"fe"."price" is not null`);
  }
  if (filter.attributes) {
    Object.entries(filter.attributes).forEach(([key, value], i) => {
      conditions.push(`
        exists(
          select from "attributes" "a"
          where "a"."contract" = "nte"."address"
            and "a"."token_id" = "nte"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `);
      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  baseQuery += ` order by "nte"."block" desc`;

  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  return db.manyOrNone(baseQuery, filter);
};
