/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";
import { logger } from "@/common/logger";

import _ from "lodash";
import slugify from "slugify";
import * as soundxyz from "../extend/soundxyz/index";
import { RequestWasThrottledError } from "./utils";
import { openseaMetadataProvider } from "./opensea-metadata-provider";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export class SoundxyzMetadataProvider extends AbstractBaseMetadataProvider {
  method = "soundxyz";
  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    const {
      data: {
        data: { releaseFromToken },
      },
    } = await soundxyz.getContractSlug(contract, tokenId);
    const royalties = [];

    if (releaseFromToken.fundingAddress && releaseFromToken.royaltyBps) {
      royalties.push({
        recipient: _.toLower(releaseFromToken.fundingAddress),
        bps: releaseFromToken.royaltyBps,
      });
    }

    return {
      id: `${contract}`,
      slug: slugify(releaseFromToken.titleSlug, { lower: true }),
      name: `${releaseFromToken.artist.name} - ${releaseFromToken.title}`,
      community: "sound.xyz",
      metadata: {
        imageUrl: releaseFromToken.coverImage.url,
        description: releaseFromToken.description,
        externalUrl: `https://sound.xyz/${releaseFromToken.artist.soundHandle}/${releaseFromToken.titleSlug}`,
      },
      royalties,
      openseaRoyalties: await openseaMetadataProvider
        .getCollectionMetadata(contract, tokenId)
        .then((m) => m.openseaRoyalties)
        .catch(() => []),
      contract,
      tokenIdRange: null,
      tokenSetId: `contract:${contract}`,
    };
  }

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const data = [];

    for (const { contract, tokenId } of tokens) {
      try {
        const [response, collection] = await Promise.all([
          soundxyz.getContractSlug(contract, tokenId),
          this.getCollectionId(contract, tokenId),
        ]);

        data.push(this.parse(contract, tokenId, collection, response.data.data.releaseFromToken));
      } catch (error) {
        logger.error(
          "soundxyz-fetcher",
          `fetchTokens error. contract:${contract}, tokenId:${tokenId}, error:${error}`
        );

        this.handleError(error);
      }
    }

    // TODO: remove this
    return data.filter(Boolean) as TokenMetadata[];
  }

  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
  }

  getCollectionId = async (contract: string, tokenId: string) => {
    // If this is not a shared contract collection -> contract
    if (
      _.indexOf(soundxyz.SoundxyzArtistContracts, _.toLower(contract)) === -1 &&
      _.indexOf(soundxyz.SoundxyzReleaseContracts, _.toLower(contract)) === -1
    ) {
      return contract;
    }

    // Shared contract logic
    const {
      data: {
        data: { releaseFromToken },
      },
    } = await soundxyz.getContractSlug(contract, tokenId);
    return `${contract}:soundxyz-${releaseFromToken.id}`;
  };

  parse = (contract: string, tokenId: string, collection: any, releaseFromToken: any) => {
    const isGoldenEgg = releaseFromToken.eggGame?.nft.tokenId === tokenId;
    let imageUrl =
      releaseFromToken.animatedCoverImage?.url ??
      releaseFromToken.coverImage?.url ??
      releaseFromToken.staticCoverImage?.url;
    if (isGoldenEgg) {
      imageUrl =
        releaseFromToken.eggGame.animatedGoldenEggImageOptimized?.url ??
        releaseFromToken.eggGame.goldenEggImage?.url;
    }

    return {
      contract: contract,
      tokenId: tokenId,
      collection,
      name: releaseFromToken.title,
      flagged: false,
      description: releaseFromToken.behindTheMusic,
      imageUrl,
      mediaUrl: releaseFromToken.track.revealedAudio.url,
      attributes: (
        (isGoldenEgg
          ? releaseFromToken.eggGame.nft.openSeaMetadataAttributes
          : releaseFromToken.baseMetadataAttributes) || []
      ).map((trait: any) => ({
        key: trait.traitType ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  };

  handleError(error: any) {
    if (error.response?.status === 429 || error.response?.status === 503) {
      let delay = 1;

      if (error.response.data.detail?.startsWith("Request was throttled. Expected available in")) {
        try {
          delay = error.response.data.detail.split(" ")[6];
        } catch {
          // Skip on any errors
        }
      }

      throw new RequestWasThrottledError(error.response.statusText, delay);
    }

    throw error;
  }
}
