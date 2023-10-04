import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";

export const getTokensFlagStatusWithTokenIds = async (
  tokens: { contract: string; tokenId: string }[]
): Promise<{ contract: string; tokenId: string; isFlagged: boolean | null }[]> => {
  const result = await openseaMetadataProvider.getTokensMetadata(tokens);

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
  const result = await openseaMetadataProvider.getTokensMetadataBySlug(slug, continuation || "");

  const parsedTokens = result.metadata.map((token) => ({
    contract: token.contract,
    tokenId: token.tokenId,
    isFlagged: token.flagged,
  }));

  const nextContinuation = result.continuation;

  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};
