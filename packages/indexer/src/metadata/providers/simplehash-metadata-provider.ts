/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";
import { logger } from "@/common/logger";
import { Contract } from "ethers";
import { Interface } from "ethers/lib/utils";
import axios from "axios";
import { normalizeMetadata } from "./utils";
import _ from "lodash";
import { getNetworkName } from "@/config/network";
import { baseProvider } from "@/common/provider";
import slugify from "slugify";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export class SimplehashMetadataProvider extends AbstractBaseMetadataProvider {
  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    const network = this.getSimplehashNetworkName();
    const url = `https://api.simplehash.com/api/v0/nfts/${network}/${contract}/${tokenId}`;

    try {
      const data = await axios
        .get(url, {
          headers: { "X-API-KEY": config.simplehashApiKey.trim() },
        })
        .then((response) => response.data);

      let slug = null;
      if (_.isArray(data.collection.marketplace_pages)) {
        for (const market of data.collection.marketplace_pages) {
          if (market.marketplace_id === "opensea") {
            slug = slugify(market.marketplace_collection_id, { lower: true });
          }
        }
      }

      return {
        id: contract,
        slug,
        name: data.collection.name,
        community: null,
        metadata: normalizeMetadata(data.collection),
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        creator: _.toLower(data.contract.deployed_by),
      };
    } catch (error) {
      logger.error(
        "simplehash-fetcher",
        `fetchCollection error. url:${url}  contract:${contract}, error:${error}`
      );

      const name = await new Contract(
        contract,
        new Interface(["function name() view returns (string)"]),
        baseProvider
      ).name();

      return {
        id: contract,
        slug: null,
        name: name,
        community: null,
        metadata: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        isFallback: true,
      };
    }
  }

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const network = this.getSimplehashNetworkName();
    const searchParams = new URLSearchParams();

    const nftIds = tokens.map(({ contract, tokenId }) => `${network}.${contract}.${tokenId}`);

    searchParams.append("nft_ids", nftIds.join(","));

    const url = `https://api.simplehash.com/api/v0/nfts/assets?${searchParams.toString()}`;
    const data = await axios
      .get(url, {
        headers: { "X-API-KEY": config.simplehashApiKey.trim() },
      })
      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "simplehash-fetcher",
          `fetchTokens error. url:${url} message:${error.message},  status:${
            error.response?.status
          }, data:${JSON.stringify(error.response?.data)}`
        );

        throw error;
      });

    return data.nfts.map(this.parse).filter(Boolean);
  }

  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
  }

  parse = (asset: any) => {
    const {
      image_original_url,
      animation_original_url,
      metadata_original_url,
      attributes,
      ...original_metadata
    } = asset.extra_metadata;

    return {
      contract: _.toLower(asset.contract_address),
      tokenId: asset.token_id,
      name: asset.name,
      collection: _.toLower(asset.contract_address),
      slug:
        asset.collection.marketplace_pages.filter(
          (market: any) => market.marketplace_id === "opensea"
        )[0]?.marketplace_collection_id ?? undefined,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: asset.description,
      originalMetadata: original_metadata,
      imageUrl: asset.previews?.image_medium_url ?? asset.image_url,
      imageOriginalUrl: image_original_url,
      animationOriginalUrl: animation_original_url,
      metadataOriginalUrl: metadata_original_url,
      imageProperties: asset.image_properties,
      mediaUrl: asset.video_url,
      attributes: (attributes || []).map((trait: any) => ({
        key: trait.trait_type ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  };

  getSimplehashNetworkName(): string {
    const network = getNetworkName();
    if (!network) {
      throw new Error("Unsupported chain id");
    }

    if (network == "mainnet") {
      return "ethereum";
    }

    if (network == "zksync") {
      return "zksync-era";
    }

    if (network == "goerli") {
      return "ethereum-goerli";
    }

    if (network == "mumbai") {
      return "polygon-mumbai";
    }

    return network;
  }
}

export const simplehashMetadataProvider = new SimplehashMetadataProvider();
