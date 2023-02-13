import { ItemMetadataUpdatePayload } from "@opensea/stream-js";

export const handleEvent = (payload: ItemMetadataUpdatePayload): any | null => {
  console.log(payload);
  return {};
};
