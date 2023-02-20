import { ItemMetadataUpdatePayload } from "@opensea/stream-js";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import { logger } from "@/common/logger";

export const handleEvent = async (payload: ItemMetadataUpdatePayload | any): Promise<null> => {
  logger.info(
    "opensea-websocket-ITEM_METADATA_UPDATED",
    `Processing metadata ${JSON.stringify(payload)}`
  );
  const [, collection, tokenId] = payload.item.nft_id.split("/");
  await metadataIndexWrite.addToQueue([
    {
      collection,
      contract: collection,
      tokenId,
      name: payload.item.metadata.name ?? undefined,
      description: payload.item.metadata.description ?? undefined,
      imageUrl: payload.item.metadata.image_url ?? undefined,
      mediaUrl: payload.item.metadata.media_url ?? undefined,
      flagged: false,
      attributes: payload.item.metadata.traits.map(
        (trait: {
          display_type?: any;
          max_value?: any;
          order?: any;
          trait_count: 0;
          trait_type: string;
          value: string | number;
        }) => ({
          key: trait.trait_type,
          value: trait.value,
          kind: typeof trait.value,
        })
      ),
    },
  ]);
  return null;
};
