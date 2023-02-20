import { ItemMetadataUpdatePayload } from "@opensea/stream-js";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import { logger } from "@/common/logger";

export const handleEvent = async (payload: ItemMetadataUpdatePayload | any): Promise<void> => {
  const [, contract, tokenId] = payload.item.nft_id.split("/");

  logger.info(
    "opensea-websocket-ITEM_METADATA_UPDATED",
    `Processing metadata ${JSON.stringify(payload)}`
  );

  await metadataIndexWrite.addToQueue([
    {
      collection: contract,
      contract,
      tokenId,
      name: payload.item.metadata.name ?? undefined,
      description: payload.item.metadata.description ?? undefined,
      imageUrl: payload.item.metadata.image_url ?? undefined,
      mediaUrl: payload.item.metadata.animation_url ?? undefined,
      attributes: [],
    },
  ]);
};
