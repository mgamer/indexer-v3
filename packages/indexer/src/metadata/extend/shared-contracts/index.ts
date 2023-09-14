/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { CollectionMetadata } from "@/metadata/types";
export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId = null
) => {
  return {
    ...metadata,
    royalties: [],
  };
};
