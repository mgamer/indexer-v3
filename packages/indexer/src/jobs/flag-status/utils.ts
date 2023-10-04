import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";

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
  slug: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  const result = await openseaMetadataProvider._getTokensFlagStatus(slug, continuation || "");

  const nextContinuation = result.continuation;

  return { tokens: result.data, nextContinuation: nextContinuation || null };
};
