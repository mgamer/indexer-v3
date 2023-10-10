import { hasExtendCollectionHandler } from "@/metadata/extend";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";
import { CollectionNotFoundError } from "@/metadata/providers/utils";
import { collectionMetadataQueueJob } from "../collection-updates/collection-metadata-queue-job";
import { Collections } from "@/models/collections";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { CollectionsEntity } from "@/models/collections/collections-entity";

export const getTokensFlagStatusWithTokenIds = async (
  tokens: { contract: string; tokenId: string }[]
): Promise<{ contract: string; tokenId: string; isFlagged: boolean | null }[]> => {
  const result = await openseaMetadataProvider.getTokensMetadata(tokens, {
    isRequestForFlaggedMetadata: true,
  });

  const parsedResults = result.map((token) => ({
    contract: token.contract,
    tokenId: token.tokenId,
    isFlagged: token.flagged,
  }));

  return parsedResults;
};

export const getTokensFlagStatusForCollection = async (
  slug: string | null,
  contract: string,
  collectionId: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  let parsedTokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
  let nextContinuation: string | null = null;
  try {
    const result = await openseaMetadataProvider._getTokensFlagStatusByCollectionPagination(
      slug,
      contract,
      continuation || ""
    );

    parsedTokens = result.data;
    nextContinuation = result.continuation;
  } catch (error) {
    if (error instanceof CollectionNotFoundError && contract) {
      // refresh the collection slug, ours might be wrong.
      const collection = await Collections.getById(collectionId);
      if (!collection) throw "Collection not found by id: " + collectionId;

      await collectionMetadataQueueJob.addToQueue({
        contract: contract,
        tokenId: collection?.tokenIdRange[0].toString() || "",
        forceRefresh: true,
      });

      // slug is wrong, try to get the collection only based on the contract if its not a shared collection
      if (!hasExtendCollectionHandler(contract)) {
        const result = await openseaMetadataProvider._getTokensFlagStatusByCollectionPagination(
          null,
          contract,
          continuation || ""
        );

        parsedTokens = result.data;
        nextContinuation = result.continuation;
      } else {
        // if its a shared collection, we need to only refresh the tokens that are in the collection
        await getCollectionTokensAndAddToFlagStatusTokenRefresh(collection);
      }
    } else throw error;
  }
  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};

export const getCollectionTokensAndAddToFlagStatusTokenRefresh = async (
  collection: CollectionsEntity
) => {
  const startTokenId = collection?.tokenIdRange[0];
  const endTokenId = collection?.tokenIdRange[1];

  const MAX_COLLECTION_SIZE = 25000;
  if (startTokenId && endTokenId && endTokenId - startTokenId < MAX_COLLECTION_SIZE) {
    const tokens = [];
    for (let i = startTokenId; i <= endTokenId; i++) {
      tokens.push({ contract: collection.contract, tokenId: i.toString() });
    }
    await PendingFlagStatusSyncTokens.add(tokens, true);
  }
};
