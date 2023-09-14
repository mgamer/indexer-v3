/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  return {
    ...metadata,
    attributes: [
      {
        key: "Name",
        value: metadata.name,
        kind: "string",
        rank: 1,
      },
    ],
  };
};
