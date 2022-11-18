import _ from "lodash";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as registry from "@/utils/royalties/registry";

export type Royalty = {
  recipient: string;
  bps: number;
};

export const getRoyalties = async (
  contract: string,
  tokenId?: string,
  spec = "default"
): Promise<Royalty[]> => {
  const royaltiesResult = await idb.oneOrNone(
    `
      SELECT
        collections.royalties,
        collections.new_royalties
      FROM tokens
      JOIN collections
        ON tokens.collection_id = collections.id
      WHERE tokens.contract = $/contract/
        ${tokenId ? " AND tokens.token_id = $/tokenId/" : ""}
      LIMIT 1
    `,
    {
      contract: toBuffer(contract),
      tokenId,
    }
  );
  if (!royaltiesResult) {
    return [];
  }

  if (spec === "default") {
    return royaltiesResult.royalties ?? [];
  } else {
    return (royaltiesResult.new_royalties ?? {})[spec];
  }
};

export const updateRoyaltySpec = async (collection: string, spec: string, royalties: Royalty[]) => {
  if (!royalties.length) {
    return;
  }

  // Fetch the current royalties
  const currentRoyalties = await idb.oneOrNone(
    `
      SELECT
        COALESCE(collections.new_royalties, '{}') AS royalties
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );

  if (currentRoyalties) {
    // Always keep the latest royalty per spec
    if (!_.isEqual(currentRoyalties.royalties[spec], royalties)) {
      currentRoyalties.royalties[spec] = royalties;

      await idb.none(
        `
          UPDATE collections SET
            new_royalties = $/royalties:json/
          WHERE collections.id = $/collection/
        `,
        {
          collection,
          royalties: currentRoyalties.royalties,
        }
      );
    }
  }
};

// At the moment we support: custom, opensea and royalty registry specs
export const refreshAllRoyaltySpecs = async (
  collection: string,
  customRoyalties: Royalty[],
  openseaRoyalties: Royalty[]
) => {
  // Update custom royalties
  await updateRoyaltySpec(collection, "custom", customRoyalties);

  // Update opensea royalties
  await updateRoyaltySpec(collection, "opensea", openseaRoyalties);

  // Refresh the on-chain royalties
  await registry.refreshRegistryRoyalties(collection);
};

// The default royalties are represented by the max royalties across all royalty specs
export const refreshDefaulRoyalties = async (collection: string) => {
  const royaltiesResult = await idb.oneOrNone(
    `
      SELECT
        collections.new_royalties
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );
  if (!royaltiesResult) {
    return [];
  }

  const getTotalRoyaltyBps = (royalties?: Royalty[]) =>
    (royalties || []).map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  let defultRoyalties: Royalty[] = [];
  let currentTotalBps = 0;
  for (const kind of Object.keys(royaltiesResult.new_royalties || {})) {
    const newRoyaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.new_royalties[kind]);
    if (newRoyaltiesTotalBps > currentTotalBps) {
      defultRoyalties = royaltiesResult.new_royalties[kind];
      currentTotalBps = newRoyaltiesTotalBps;
    }
  }

  await idb.none(
    `
      UPDATE collections SET
        royalties = $/royalties:json/
      WHERE collections.id = $/id/
    `,
    {
      id: collection,
      royalties: defultRoyalties,
    }
  );
};
