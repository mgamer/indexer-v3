import _ from "lodash";

import { edb, idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as registry from "@/utils/royalties/registry";

export type Royalty = {
  recipient: string;
  bps: number;
};

// TODO: Deprecate
export const getDefaultRoyalties = async (
  contract: string,
  tokenId: string
): Promise<Royalty[]> => {
  // Due to legacy reasons, we have the royalties of a collection split over two colums:
  // `royalties` and `royalties_new`. The `royalties` column holds an array of `Royalty`
  // objects, while the `new_royalties` column holds an object pointing to arrays which
  // have `Royalty` values (this is for accommodating multiple royalty standards - with
  // each key of the object denoting a different standard).
  const royaltiesResult = await edb.oneOrNone(
    `
      SELECT
        collections.royalties,
        collections.new_royalties
      FROM tokens
      JOIN collections
        ON tokens.collection_id = collections.id
      WHERE tokens.contract = $/contract/
        AND tokens.token_id = $/tokenId/
    `,
    {
      contract: toBuffer(contract),
      tokenId,
    }
  );
  if (!royaltiesResult) {
    return [];
  }

  const getTotalRoyaltyBps = (royalties?: Royalty[]) =>
    (royalties || []).map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  let currentRoyalties: Royalty[] = [];
  let currentTotalBps = 0;

  // Handle `royalties`
  const royaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.royalties);
  if (royaltiesTotalBps > currentTotalBps) {
    currentRoyalties = royaltiesResult.royalties;
    currentTotalBps = royaltiesTotalBps;
  }

  // Handle `new_royalties`
  for (const kind of Object.keys(royaltiesResult.new_royalties || {})) {
    const newRoyaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.new_royalties[kind]);
    if (newRoyaltiesTotalBps > currentTotalBps) {
      currentRoyalties = royaltiesResult.new_royalties[kind];
      currentTotalBps = newRoyaltiesTotalBps;
    }
  }

  return currentRoyalties;
};

// default royalty = max royalty across all available royalty standards
export const computeDefaultRoyalties = async (collection: string): Promise<Royalty[]> => {
  const royaltiesResult = await edb.oneOrNone(
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

  let currentRoyalties: Royalty[] = [];
  let currentTotalBps = 0;
  for (const kind of Object.keys(royaltiesResult.new_royalties || {})) {
    const newRoyaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.new_royalties[kind]);
    if (newRoyaltiesTotalBps > currentTotalBps) {
      currentRoyalties = royaltiesResult.new_royalties[kind];
      currentTotalBps = newRoyaltiesTotalBps;
    }
  }

  return currentRoyalties;
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

export const refreshRoyalties = async (
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

  // Reset the collection's default royalties
  const defaultRoyalties = await computeDefaultRoyalties(collection);
  await idb.none(
    `
      UPDATE collections SET
        royalties = $/royalties:json/
      WHERE collections.id = $/id/
    `,
    {
      id: collection,
      royalties: defaultRoyalties,
    }
  );
};
