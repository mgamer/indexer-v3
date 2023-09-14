/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      {
        key: "Trait Count",
        value: metadata.attributes.length,
        kind: "string",
        rank: 2,
      },
    ],
  };
};
