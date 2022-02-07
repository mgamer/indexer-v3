import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { db } from "@/common/db";

export type Filter = {
  contract?: string;
  tokenId?: string;
  tokenSetId?: string;
  onSale?: boolean;
  sortBy?: "tokenId" | "floorSellValue" | "topBuyValue";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type Response = {
  contract: string;
  tokenId: string;
  name: string | null;
  image: string | null;
  topBuyValue: number | null;
  floorSellValue: number | null;
}[];

export const execute = async (filter: Filter): Promise<Response> => {
  let baseQuery = `
    SELECT
      "t"."contract",
      "t"."token_id",
      "t"."name",
      "t"."image",
      "t"."floor_sell_value",
      "t"."top_buy_value"
    FROM "tokens" "t"
  `;

  if (filter.tokenSetId) {
    baseQuery += `
      JOIN "token_sets_tokens" "tst"
        ON "t"."contract" = "tst"."contract"
        AND "t"."token_id" = "tst"."token_id"
    `;
  }

  // Filters
  const conditions: string[] = [];
  if (filter.contract) {
    (filter as any).contract = toBuffer(filter.contract);
    conditions.push(`"t"."contract" = $/contract/`);
  }
  if (filter.tokenId) {
    conditions.push(`"t"."token_id" = $/tokenId/`);
  }
  if (filter.tokenSetId) {
    conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
  }
  if (filter.onSale === true) {
    conditions.push(`"t"."floor_sell_value" IS NOT NULL`);
  } else if (filter.onSale === false) {
    conditions.push(`"t"."floor_sell_value" IS NULL`);
  }
  if (conditions.length) {
    baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
  }

  // Sorting
  switch (filter.sortBy) {
    case "tokenId": {
      baseQuery += ` ORDER BY "t"."token_id" ${filter.sortDirection || "ASC"}`;
      break;
    }

    case "topBuyValue": {
      baseQuery += ` ORDER BY "t"."top_buy_value" ${
        filter.sortDirection || "DESC"
      } NULLS LAST, "t"."token_id"`;
      break;
    }

    case "floorSellValue":
    default: {
      baseQuery += ` ORDER BY "t"."floor_sell_value" ${
        filter.sortDirection || "ASC"
      } NULLS LAST, "t"."token_id"`;
      break;
    }
  }

  // Pagination
  baseQuery += ` OFFSET $/offset/`;
  baseQuery += ` LIMIT $/limit/`;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      contract: fromBuffer(r.contract),
      tokenId: r.token_id,
      name: r.name,
      image: r.image,
      // TODO: Integrate the collection once available
      collection: {
        id: null,
        name: null,
      },
      topBuyValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
      floorSellValue: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
    }))
  );
};
