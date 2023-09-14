/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { customHandleContractTokens, customHandleToken, hasCustomHandler } from "@/metadata/custom";
import { MetadataProvidersMap } from "@/metadata/providers";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "@/metadata/types";
import { extendMetadata, hasExtendHandler } from "@/metadata/extend";

export class MetadataApi {
  public static async getCollectionMetadata(
    contract: string,
    tokenId: string,
    community = "",
    options?: {
      allowFallback?: boolean;
      indexingMethod?: string;
      additionalQueryParams?: { [key: string]: string };
    }
  ): Promise<CollectionMetadata> {
    if (config.liquidityOnly) {
      return await MetadataProvidersMap["onchain"].getCollectionMetadata(contract, tokenId);
    }
    // get custom / extended metadata locally
    if (hasCustomHandler(config.chainId, contract)) {
      const result = await customHandleContractTokens(config.chainId, contract, tokenId);
      return result;
    }

    let indexingMethod =
      options?.indexingMethod ?? MetadataApi.getCollectionIndexingMethod(community);

    //TODO: Remove when adding proper support for overriding indexing method
    if (config.chainId === 1 && contract === "0xd532b88607b1877fe20c181cba2550e3bbd6b31c") {
      indexingMethod = "simplehash";
    }

    if (config.chainId === 137 && contract === "0x2953399124f0cbb46d2cbacd8a89cf0599974963") {
      indexingMethod = "simplehash";
    }

    const collection: CollectionMetadata = await MetadataProvidersMap[
      indexingMethod
    ].getCollectionMetadata(contract, tokenId);

    if (collection.isFallback && !options?.allowFallback) {
      throw new Error("Fallback collection data not acceptable");
    }

    return collection;
  }

  public static async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[],
    method = ""
  ): Promise<TokenMetadata[]> {
    method = method === "" ? config.metadataIndexingMethod : method;

    return await MetadataProvidersMap[method].getTokensMetadata(tokens);
  }

  // This just checks the extend for the token, it doesn't actually fetch the metadata
  public static async parseTokenMetadata(
    request: {
      asset_contract: {
        address: string;
      };
      collection: {
        slug: string;
      };
      token_id: string;
      name?: string;
      description?: string;
      image_url?: string;
      animation_url?: string;
      traits: Array<{
        trait_type: string;
        value: string | number | null;
      }>;
    },
    method = ""
  ): Promise<TokenMetadata | null> {
    if (method !== "opensea") {
      throw new Error("Method not implemented: " + method);
    }

    if (hasCustomHandler(config.chainId, request.asset_contract.address)) {
      const result = await customHandleToken(config.chainId, {
        contract: request.asset_contract.address,
        _tokenId: request.token_id,
      });
      return result;
    }

    if (hasExtendHandler(config.chainId, request.asset_contract.address)) {
      const result = await extendMetadata(config.chainId, {
        contract: request.asset_contract.address,
        slug: request.collection.slug,
        collection: request.asset_contract.address,
        flagged: null,
        tokenId: request.token_id,
        name: request.name ?? "",
        description: request.description ?? "",
        imageUrl: request.image_url ?? "",
        mediaUrl: request.animation_url ?? "",
        attributes: request.traits.map((trait) => ({
          key: trait.trait_type,
          value: trait.value,
          kind: typeof trait.value == "number" ? "number" : "string",
        })),
      });
      return result;
    }

    return {
      contract: request.asset_contract.address,
      slug: request.collection.slug,
      collection: request.asset_contract.address,
      flagged: null,
      tokenId: request.token_id,
      name: request.name ?? "",
      description: request.description ?? "",
      imageUrl: request.image_url ?? "",
      mediaUrl: request.animation_url ?? "",
      attributes: request.traits.map((trait) => ({
        key: trait.trait_type,
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
      })),
    };
  }

  public static async getTokensMetadataBySlug(
    contract: string,
    slug: string,
    method = "",
    continuation?: string
  ): Promise<TokenMetadataBySlugResult> {
    if (method !== "opensea") {
      throw new Error("Method not implemented.");
    }
    return await MetadataProvidersMap["opensea"].getTokensMetadataBySlug(
      contract,
      slug,
      continuation ?? ""
    );
  }

  public static getCollectionIndexingMethod(community: string | null) {
    switch (community) {
      case "sound.xyz":
        return "soundxyz";
    }

    return config.metadataIndexingMethodCollection;
  }
}

export { MetadataApi as default };
