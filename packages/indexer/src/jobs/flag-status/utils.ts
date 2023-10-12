import { hasExtendCollectionHandler } from "@/metadata/extend";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";
import { CollectionNotFoundError } from "@/metadata/providers/utils";
import { collectionMetadataQueueJob } from "../collection-updates/collection-metadata-queue-job";
import { Collections } from "@/models/collections";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { logger } from "ethers";

export const getTokensFlagStatusWithTokenIds = async (
  contract: string,
  tokenId: string
): Promise<{ contract: string; tokenId: string; isFlagged: boolean | null }> => {
  const result = await openseaMetadataProvider._getTokenFlagStatus(contract, tokenId);

  return result.data;
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
  let result: {
    data: { contract: string; tokenId: string; isFlagged: boolean }[];
    continuation: string | null;
  } = { data: [], continuation: null };
  try {
    if (slug) {
      await openseaMetadataProvider._getTokensFlagStatusByCollectionPaginationViaSlug(
        slug,
        continuation || ""
      );
    } else if (contract && !hasExtendCollectionHandler(contract)) {
      result = await openseaMetadataProvider._getTokensFlagStatusByCollectionPaginationViaContract(
        contract,
        continuation || ""
      );
    } else {
      // if its a shared collection, we need to only refresh the tokens that are in the collection
      // for now, just log that we are refreshing all tokens
      logger.info("getTokensFlagStatusForCollection", "Shared collection, refreshing all tokens");
      return { tokens: [], nextContinuation: null };
    }

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
        const result =
          await openseaMetadataProvider._getTokensFlagStatusByCollectionPaginationViaContract(
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
  logger.info(
    "getCollectionTokensAndAddToFlagStatusTokenRefresh",
    "Shared collection, refreshing all tokens"
  );

  // dont do this for now
  return;
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
