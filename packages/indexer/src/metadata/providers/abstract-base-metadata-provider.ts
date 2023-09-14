import { config } from "@/config/index";
import { customHandleContractTokens, customHandleToken, hasCustomHandler } from "../custom";
import {
  Collection,
  CollectionMetadata,
  MapEntry,
  Metadata,
  TokenMetadata,
  TokenMetadataBySlugResult,
} from "../types";
import { extendMetadata, hasExtendHandler } from "../extend";

export abstract class AbstractBaseMetadataProvider {
  abstract method: string;

  async getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    // handle universal extend/custom logic here
    if (hasCustomHandler(config.chainId, contract)) {
      const result = await customHandleContractTokens(config.chainId, contract, tokenId);
      return result;
    }

    return this._getCollectionMetadata(contract, tokenId);
  }

  async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const customMetadata = await Promise.all(
      tokens.map(async (token) => {
        if (hasCustomHandler(config.chainId, token.contract)) {
          const result = await customHandleToken(config.chainId, {
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
        if (hasExtendHandler(config.chainId, metadata.contract)) {
          const result = await extendMetadata(config.chainId, metadata);
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
    if (hasCustomHandler(config.chainId, contract) || hasExtendHandler(config.chainId, contract)) {
      throw new Error("Custom handler is not supported with collection slug.");
    }

    return this._getTokensMetadataBySlug(slug, continuation);
  }

  normalizeMetadata = (collection: Collection): Metadata => {
    if (!collection) {
      return {};
    }

    const normalizeLink = (link: string) => {
      if (link.startsWith("ipfs://")) {
        return `https://ipfs.io/ipfs/${link.slice(7)}`;
      }

      return link;
    };

    const map: Record<string, MapEntry> = {
      discord: {
        key: "discordUrl",
      },
      discord_url: {
        key: "discordUrl",
      },
      twitter_username: {
        key: "twitterUsername",
        normalize: (value: string) => {
          // if the value is a url, return the username
          if (value?.includes("twitter.com")) {
            return value.split("/")[3];
          }

          return value;
        },
      },
      twitter: {
        key: "twitterUrl",
        normalize: (value: string) => {
          if (value?.includes("twitter.com")) {
            return value;
          }
          // if the value is a username, return the url
          return `https://twitter.com/${value}`;
        },
      },
      telegram: {
        key: "telegramUrl",
        normalize: (value: string) => {
          if (value?.includes("t.me")) {
            return value;
          }

          return `https://t.me/${value}`;
        },
      },
      instagram: {
        key: "instagramUrl",
        normalize: (value: string) => {
          if (value?.includes("instagram.com")) {
            return value;
          }
          return `https://instagram.com/${value}`;
        },
      },
      medium: {
        key: "mediumUrl",
      },
      github: {
        key: "githubUrl",
      },
      website: {
        key: "externalUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      website_url: {
        key: "externalUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      external_url: {
        key: "externalUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      image: {
        key: "imageUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      image_url: {
        key: "imageUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      cover_image: {
        key: "bannerImageUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      banner_image_url: {
        key: "bannerImageUrl",
        normalize: (value: string) => normalizeLink(value),
      },
      safelist_request_status: {
        key: "safelistRequestStatus",
      },
      name: {
        key: "name",
      },
      description: {
        key: "description",
      },
    };

    const metadata: Metadata = {};
    if (collection?.social_urls) {
      Object.keys(collection.social_urls).forEach((key) => {
        const mapKey = map[key];
        if (mapKey) {
          if (mapKey.normalize && collection.social_urls && collection.social_urls[key]) {
            metadata[mapKey.key] = mapKey.normalize(collection.social_urls[key]);
          } else if (collection.social_urls && collection.social_urls[key]) {
            metadata[mapKey.key] = collection.social_urls[key];
          }
        }
      });
    }

    // // do the above via the map
    // Object.keys(map).forEach((key) => {
    //   const mapKey = map[key];
    //   if (mapKey && key in collection) {
    //     const collectionKey = collection[key as keyof Collection];
    //     if (mapKey.normalize && collectionKey) {
    //       // Check for normalize function before invoking
    //       const normalizedValue = mapKey.normalize ? mapKey.normalize(collectionKey) : undefined;
    //       if (normalizedValue) {
    //         metadata[mapKey.key] = normalizedValue;
    //       }
    //     } else {
    //       metadata[mapKey.key] = collectionKey;
    //     }
    //   }
    // });

    return metadata;
  };

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
