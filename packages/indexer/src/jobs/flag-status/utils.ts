import { logger } from "@/common/logger";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";
import { Tokens } from "@/models/tokens";
import { TokensEntityUpdateParams } from "@/models/tokens/tokens-entity";

export const handleTokenFlagStatusUpdate = async ({
  context,
  token,
}: {
  context: string;
  collectionId?: string;
  token: { contract: string; tokenId: string; flagged: boolean | null };
}) => {
  try {
    const isFlagged = Number(token.flagged);

    const currentUtcTime = new Date().toISOString();

    const fields: TokensEntityUpdateParams = {
      isFlagged,
      lastFlagUpdate: currentUtcTime,
    };

    const result = await Tokens.updateFlagStatus(token.contract, token.tokenId, fields);

    if (result) {
      logger.info(
        context,
        `Flag Status Diff. contract:${token.contract}, tokenId: ${token.tokenId}, tokenIsFlagged:${token.flagged}, isFlagged:${isFlagged}`
      );

      await nonFlaggedFloorQueueJob.addToQueue([
        {
          kind: "revalidation",
          contract: token.contract,
          tokenId: token.tokenId,
          txHash: null,
          txTimestamp: null,
        },
      ]);
    } else {
      logger.info(
        context,
        `Flag Status No Change. contract:${token.contract}, tokenId: ${token.tokenId}, tokenIsFlagged:${token.flagged}, isFlagged:${isFlagged}`
      );
    }
  } catch (error) {
    // eslint-disable-next-line

    logger.error(context, `getTokenMetadata error.contract:${token.contract}, error:${error}`);
  }
};

export const getTokensFlagStatusWithTokenIds = async (
  tokens: { contract: string; tokenId: string }[]
): Promise<{ contract: string; tokenId: string; flagged: boolean | null }[]> => {
  const result = await openseaMetadataProvider.getTokensMetadata(tokens);

  const parsedResults = result.map((token) => ({
    contract: token.contract,
    tokenId: token.tokenId,
    flagged: token.flagged,
  }));

  return parsedResults;
};

export const getTokensFlagStatusForCollection = async (
  slug: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; flagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  const result = await openseaMetadataProvider.getTokensMetadataBySlug(slug, continuation || "");

  const parsedTokens = result.metadata.map((token) => ({
    contract: token.contract,
    tokenId: token.tokenId,
    flagged: token.flagged,
  }));

  const nextContinuation = result.continuation;

  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};
