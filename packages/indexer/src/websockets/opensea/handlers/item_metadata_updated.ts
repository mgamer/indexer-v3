import { ItemMetadataUpdatePayload } from "@opensea/stream-js";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import { Collections } from "@/models/collections";
import MetadataApi from "@/utils/metadata-api";

export const handleEvent = async (payload: ItemMetadataUpdatePayload | any): Promise<void> => {
  const [, contract, tokenId] = payload.item.nft_id.split("/");

  logger.info(
    "opensea-websocket-ITEM_METADATA_UPDATED",
    `Processing metadata ${JSON.stringify(payload)}`
  );

  const token = await Tokens.getByContractAndTokenId(contract, tokenId);

  if (token?.metadataIndexed) {
    const collection = await Collections.getByContractAndTokenId(contract, tokenId);
    await metadataIndexFetch.addToQueue(
      [
        {
          kind: "single-token",
          data: {
            method: metadataIndexFetch.getIndexingMethod(collection?.community || "opensea"),
            contract,
            tokenId,
            collection: token?.collectionId ?? contract,
          },
        },
      ],
      true
    );
  } else if (token != null) {
    const request = {
      asset_contract: {
        address: "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
      },
      token_id: tokenId,
      name: payload.item.metadata.name ?? undefined,
      description: payload.item.metadata.description ?? undefined,
      image_url: payload.item.metadata.image_url ?? undefined,
      animation_url: payload.item.metadata.animation_url ?? undefined,
      traits: payload.item.metadata.traits,
    };
    const metadata = await MetadataApi.parseTokenMetadata(request);

    logger.info(
      "opensea-websocket-ITEM_METADATA_UPDATED",
      `Response from metadata API: ${JSON.stringify(metadata)}`
    );

    if (metadata) {
      await metadataIndexWrite.addToQueue([metadata]);
    }
  }
};
