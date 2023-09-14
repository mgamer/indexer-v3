/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";

import axios from "axios";
import _ from "lodash";
import { baseProvider } from "@/common/provider";
import { Interface } from "ethers/lib/utils";
import { Contract } from "ethers";
import { logger } from "@/common/logger";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export class CenterdevMetadataProvider extends AbstractBaseMetadataProvider {
  method = "centerdev";
  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const network = this.getCenterdevNetworkName(config.chainId);
    const url = `https://api.center.dev/v1/${network}/assets`;

    const data = await axios
      .post(
        url,
        {
          assets: tokens.map(({ contract, tokenId }) => {
            return { Address: contract, TokenID: tokenId };
          }),
        },
        {
          headers: { "X-API-KEY": config.centerdevApiKey.trim() },
        }
      )

      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "centerdev-fetcher",
          `fetchTokens error. url:${url}  contract:${tokens}, error:${error}`
        );

        throw error;
      });

    return data.map(this.parse).filter(Boolean);
  }

  async _getCollectionMetadata(contract: string): Promise<CollectionMetadata> {
    try {
      const network = this.getCenterdevNetworkName(config.chainId);
      const url = `https://api.center.dev/v1/${network}/${contract}`;

      const data = await axios
        .get(url, {
          headers: { "X-API-KEY": config.centerdevApiKey.trim() },
        })
        .then((response) => response.data);

      return {
        id: contract,
        slug: null,
        name: data.name,
        community: null,
        metadata: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
      };
    } catch {
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
  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
  }

  parse = (asset: any) => {
    let attributes = [];

    if (asset.metadata?.attributes) {
      attributes = asset.metadata.attributes.map((trait: any) => ({
        key: trait.trait_type ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      }));
    } else if (asset.metadata?.features) {
      attributes = Object.entries(asset.metadata.features).map(([key, value]) => ({
        key,
        value,
        kind: typeof value == "number" ? "number" : "string",
        rank: 1,
      }));
    }

    let imageUrl = asset.metadata?.image;

    if (imageUrl && imageUrl.startsWith("ipfs://")) {
      imageUrl = asset.small_preview_image_url;
    }

    return {
      contract: asset.address,
      tokenId: asset.token_id,
      collection: _.toLower(asset.address),
      name: asset.name,
      description: asset.metadata?.description,
      imageUrl,
      mediaUrl: asset.metadata?.animation_url,
      attributes,
    };
  };

  getCenterdevNetworkName = (chainId: number) => {
    let network;
    if (chainId === 1) {
      network = "ethereum-mainnet";
    } else if (chainId === 4) {
      network = "ethereum-rinkeby";
    } else if (chainId === 5) {
      network = "ethereum-goerli";
    } else if (chainId === 10) {
      network = "optimism-mainnet";
    } else if (chainId === 137) {
      network = "polygon-mainnet";
    } else {
      throw new Error("Unsupported chain id");
    }

    return network;
  };
}

export const centerdevMetadataProvider = new CenterdevMetadataProvider();
