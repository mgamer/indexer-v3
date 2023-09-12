import {
  Collection,
  CollectionMetadata,
  MapEntry,
  Metadata,
  TokenMetadata,
  TokenMetadataBySlugResult,
} from "../types";

export abstract class AbstractBaseProvider {
  maxRetries = 5;
  // in milliseconds
  timeout = 30 * 1000;

  async getCollectionMetadata(
    contract: string,
    tokenId: string,
    community?: string,
    options?: {
      allowFallback?: boolean;
      indexingMethod?: string;
      additionalQueryParams?: { [key: string]: string };
    }
  ): Promise<CollectionMetadata> {
    // handle universal extend/custom logic here
    return this._getCollectionMetadata(contract, tokenId, community, options);
  }

  async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    // handle universal extend/custom logic here
    return this._getTokensMetadata(tokens);
  }

  async getTokensMetadataBySlug(
    slug: string,
    continuation: string
  ): Promise<TokenMetadataBySlugResult> {
    // handle universal extend/custom logic here
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
    tokenId: string,
    community?: string,
    options?: {
      allowFallback?: boolean;
      indexingMethod?: string;
      additionalQueryParams?: { [key: string]: string };
    }
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
