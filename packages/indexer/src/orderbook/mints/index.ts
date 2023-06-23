import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { MintTxSchema, CustomInfo } from "@/orderbook/mints/calldata";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

import * as zora from "@/orderbook/mints/calldata/detector/zora";

export type CollectionMintKind = "public" | "allowlist";
export type CollectionMintStatus = "open" | "closed";
export type CollectionMintStandard = "unknown" | "manifold" | "seadrop-v1.0" | "thirdweb" | "zora";

export type CollectionMintDetails = {
  tx: MintTxSchema;
  info?: CustomInfo;
};

export type CollectionMint = {
  collection: string;
  contract: string;
  stage: string;
  kind: CollectionMintKind;
  status: CollectionMintStatus;
  standard: CollectionMintStandard;
  details: CollectionMintDetails;
  currency: string;
  price?: string;
  tokenId?: string;
  maxMintsPerWallet?: string;
  maxSupply?: string;
  startTime?: number;
  endTime?: number;
  allowlistId?: string;
};

export const getCollectionMints = async (
  collection: string,
  filters?: {
    status?: CollectionMintStatus;
    stage?: string;
    tokenId?: string;
  }
): Promise<CollectionMint[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        collection_mints.*,
        collection_mint_standards.standard,
        collections.contract
      FROM collection_mints
      JOIN collections
        ON collection_mints.collection_id = collections.id
      JOIN collection_mint_standards
        ON collection_mints.collection_id = collection_mint_standards.collection_id
      WHERE collection_mints.collection_id = $/collection/
      ${filters?.stage ? " AND collection_mints.stage = $/stage/" : ""}
      ${filters?.tokenId ? " AND collection_mints.token_id = $/tokenId/" : ""}
        ${
          filters?.status === "open"
            ? " AND collection_mints.status = 'open'"
            : filters?.status === "closed"
            ? " AND collection_mints.status = 'closed'"
            : ""
        }
    `,
    {
      collection,
      stage: filters?.stage,
      tokenId: filters?.tokenId,
      status: filters?.status,
    }
  );

  return results.map(
    (r) =>
      ({
        collection: r.collection_id,
        contract: fromBuffer(r.contract),
        stage: r.stage,
        kind: r.kind,
        status: r.status,
        standard: r.standard,
        details: r.details,
        currency: fromBuffer(r.currency),
        price: r.price ?? undefined,
        tokenId: r.token_id ?? undefined,
        maxMintsPerWallet: r.max_mints_per_wallet ?? undefined,
        maxSupply: r.max_supply ?? undefined,
        startTime: r.start_time ? Math.floor(new Date(r.start_time).getTime() / 1000) : undefined,
        endTime: r.end_time ? Math.floor(new Date(r.end_time).getTime() / 1000) : undefined,
        allowlistId: r.allowlist_id ?? undefined,
      } as CollectionMint)
  );
};

export const saveOrUpdateCollectionMint = async (collectionMint: CollectionMint) => {
  const existingCollectionMint = await getCollectionMints(collectionMint.collection, {
    stage: collectionMint.stage,
    tokenId: collectionMint.tokenId,
  }).then((results) => (results.length ? results[0] : undefined));

  if (existingCollectionMint) {
    // If the collection mint already exists, update any out-dated fields

    const updatedFields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedParams: any = {};

    if (collectionMint.status !== existingCollectionMint.status) {
      updatedFields.push(" status = $/status/");
      updatedParams.status = collectionMint.status;
    }

    if (JSON.stringify(collectionMint.details) !== JSON.stringify(existingCollectionMint.details)) {
      updatedFields.push(" details = $/details:json/");
      updatedParams.details = collectionMint.details;
    }

    if (collectionMint.price !== existingCollectionMint.price) {
      updatedFields.push(" price = $/price/");
      updatedParams.price = collectionMint.price;
    }

    if (collectionMint.tokenId !== existingCollectionMint.tokenId) {
      updatedFields.push(" token_id = $/tokenId/");
      updatedParams.tokenId = collectionMint.tokenId;
    }

    if (collectionMint.maxMintsPerWallet !== existingCollectionMint.maxMintsPerWallet) {
      updatedFields.push(" max_mints_per_wallet = $/maxMintsPerWallet/");
      updatedParams.maxMintsPerWallet = collectionMint.maxMintsPerWallet;
    }

    if (collectionMint.maxSupply !== existingCollectionMint.maxSupply) {
      updatedFields.push(" max_supply = $/maxSupply/");
      updatedParams.maxSupply = collectionMint.maxSupply;
    }

    if (collectionMint.startTime !== existingCollectionMint.startTime) {
      updatedFields.push(" start_time = $/startTime/");
      updatedParams.startTime = collectionMint.startTime
        ? new Date(collectionMint.startTime * 1000)
        : null;
    }

    if (collectionMint.endTime !== existingCollectionMint.endTime) {
      updatedFields.push(" end_time = $/endTime/");
      updatedParams.endTime = collectionMint.endTime
        ? new Date(collectionMint.endTime * 1000)
        : null;
    }

    if (collectionMint.allowlistId !== existingCollectionMint.allowlistId) {
      updatedFields.push(" allowlist_id = $/allowlistId/");
      updatedParams.allowlistId = collectionMint.allowlistId;
    }

    if (updatedFields.length) {
      await idb.none(
        `
          UPDATE collection_mints SET
            ${updatedFields.join(", ")},
            updated_at = now()
          WHERE collection_mints.collection_id = $/collection/
            AND collection_mints.stage = $/stage/
            ${collectionMint.tokenId ? " AND collection_mints.token_id = $/tokenId/" : ""}
        `,
        {
          collection: collectionMint.collection,
          stage: collectionMint.stage,
          tokenId: collectionMint.tokenId,
          ...updatedParams,
        }
      );

      return true;
    }
  } else {
    // Otherwise, it's the first time we see this collection mint so we save it

    await idb.none(
      `
        INSERT INTO collection_mint_standards (
          collection_id,
          standard
        ) VALUES (
          $/collection/,
          $/standard/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        standard: collectionMint.standard,
      }
    );

    await idb.none(
      `
        INSERT INTO collection_mints (
          collection_id,
          stage,
          kind,
          status,
          details,
          currency,
          price,
          token_id,
          max_mints_per_wallet,
          max_supply,
          start_time,
          end_time,
          allowlist_id
        ) VALUES (
          $/collection/,
          $/stage/,
          $/kind/,
          $/status/,
          $/details:json/,
          $/currency/,
          $/price/,
          $/tokenId/,
          $/maxMintsPerWallet/,
          $/maxSupply/,
          $/startTime/,
          $/endTime/,
          $/allowlistId/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        stage: collectionMint.stage,
        kind: collectionMint.kind,
        status: collectionMint.status,
        details: collectionMint.details,
        currency: toBuffer(collectionMint.currency),
        price: collectionMint.price ?? null,
        tokenId: collectionMint.tokenId ?? null,
        maxMintsPerWallet: collectionMint.maxMintsPerWallet ?? null,
        maxSupply: collectionMint.maxSupply ?? null,
        startTime: collectionMint.startTime ? new Date(collectionMint.startTime * 1000) : null,
        endTime: collectionMint.endTime ? new Date(collectionMint.endTime * 1000) : null,
        allowlistId: collectionMint.allowlistId ?? null,
      }
    );

    return true;
  }

  return false;
};

export const refreshMintsForCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection);
  if (existingCollectionMints.length) {
    // It is guaranteed that all collection mints have the same standard
    const standard = existingCollectionMints[0].standard;

    switch (standard) {
      // For unknown mints, we re-simulate and update the status accordingly
      // TODO: We should look into re-detecting and updating any fields that
      // could have changed on the mint since the initial detection

      case "unknown": {
        for (const collectionMint of existingCollectionMints) {
          const success = await simulateCollectionMint(collectionMint, false);
          await saveOrUpdateCollectionMint({
            ...collectionMint,
            status: success ? "open" : "closed",
          });
        }

        break;
      }

      // For known mints, we can detect any field changes

      case "zora": {
        // Fetch and save/update the currently available mints
        const latestCollectionMints = await zora.getCollectionMints(collection);
        for (const collectionMint of latestCollectionMints) {
          await saveOrUpdateCollectionMint(collectionMint);
        }

        // Assume anything that exists in our system but was not returned
        // in the above call is not available anymore so we can close
        for (const existing of existingCollectionMints) {
          if (
            !latestCollectionMints.find(
              (latest) =>
                latest.collection === existing.collection &&
                latest.stage === existing.stage &&
                latest.tokenId === existing.tokenId
            )
          ) {
            await saveOrUpdateCollectionMint({
              ...existing,
              status: "closed",
            });
          }
        }

        break;
      }
    }
  }
};
