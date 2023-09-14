import { customHandleContractTokens, customHandleToken, hasCustomHandler } from "../custom";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";
import { extendMetadata, hasExtendHandler } from "../extend";

export abstract class AbstractBaseMetadataProvider {
  abstract method: string;

  async getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    // handle universal extend/custom logic here
    if (hasCustomHandler(contract)) {
      const result = await customHandleContractTokens(contract, tokenId);
      return result;
    }

    return this._getCollectionMetadata(contract, tokenId);
  }

  async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const customMetadata = await Promise.all(
      tokens.map(async (token) => {
        if (hasCustomHandler(token.contract)) {
          const result = await customHandleToken({
            contract: token.contract,
            _tokenId: token.tokenId,
          });
          return result;
        }
        return null;
      })
    );

    // filter out nulls
    const filteredCustomMetadata = customMetadata.filter((metadata) => metadata !== null);

    // for tokens that don't have custom metadata, get from metadata-api
    const tokensWithoutCustomMetadata = tokens.filter((token) => {
      const hasCustomMetadata = filteredCustomMetadata.find((metadata) => {
        return metadata.contract === token.contract && metadata.tokenId === token.tokenId;
      });
      return !hasCustomMetadata;
    });

    let metadataFromProvider: TokenMetadata[] = [];

    if (tokensWithoutCustomMetadata.length > 0) {
      const queryParams = new URLSearchParams();

      tokensWithoutCustomMetadata.forEach((token) => {
        queryParams.append("token", `${token.contract}:${token.tokenId}`);
      });

      metadataFromProvider = await this._getTokensMetadata(tokensWithoutCustomMetadata);
    }

    // merge custom metadata with metadata-api metadata
    const allMetadata: TokenMetadata[] = [...metadataFromProvider, ...filteredCustomMetadata];

    // extend metadata
    const extendedMetadata = await Promise.all(
      allMetadata.map(async (metadata) => {
        if (hasExtendHandler(metadata.contract)) {
          const result = await extendMetadata(metadata);
          return result;
        }
        return metadata;
      })
    );

    return extendedMetadata;
  }

  async getTokensMetadataBySlug(
    contract: string,
    slug: string,
    continuation: string
  ): Promise<TokenMetadataBySlugResult> {
    if (hasCustomHandler(contract) || hasExtendHandler(contract)) {
      throw new Error("Custom handler is not supported with collection slug.");
    }

    return this._getTokensMetadataBySlug(slug, continuation);
  }

  protected abstract _getCollectionMetadata(
    contract: string,
    tokenId: string
  ): Promise<CollectionMetadata>;

  protected abstract _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]>;

  protected abstract _getTokensMetadataBySlug(
    contract: string,
    slug: string,
    continuation?: string
  ): Promise<TokenMetadataBySlugResult>;
}
