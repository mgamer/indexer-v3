import { ItemMetadataUpdatePayload } from "@opensea/stream-js";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import { Collections } from "@/models/collections";

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
    await metadataIndexWrite.addToQueue([
      {
        collection: contract,
        contract,
        tokenId,
        name: payload.item.metadata.name ?? undefined,
        description: payload.item.metadata.description ?? undefined,
        imageUrl: payload.item.metadata.image_url ?? undefined,
        mediaUrl: payload.item.metadata.animation_url ?? undefined,
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
  }
};
