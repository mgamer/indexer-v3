import { HashZero } from "@ethersproject/constants";

import { config } from "@/config/index";

// Optional metadata associated to an order
export type OrderMetadata = {
  schemaHash?: string;
};

export const defaultSchemaHash = HashZero;

// For now, we hardcode the order's source metadata
export const getOrderSourceMetadata = (
  sourceId: string | null,
  contract: string,
  tokenId: string
) => {
  switch (sourceId) {
    // OpenSea
    case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": {
      return {
        id: sourceId,
        name: "OpenSea",
        icon: "https://opensea.io/static/images/logos/opensea.svg",
        url:
          config.chainId === 1
            ? `https://opensea.io/assets/${contract}/${tokenId}`
            : `https://testnets.opensea.io/assets/${contract}/${tokenId}`,
      };
    }

    // Unknown
    default: {
      return {
        id: sourceId,
        name: "Unknown",
        icon: null,
        url: null,
      };
    }
  }
};
