/* eslint-disable no-fallthrough */

// Any new network that is supported should have a corresponding
// entry in the configuration methods below.

import { config } from "@/config/index";

export const getNetworkName = () => {
  switch (config.chainId) {
    case 1:
      return "mainnet";
    case 4:
      return "rinkeby";
    case 5:
      return "goerli";
    case 10:
      return "optimism";
    default:
      return "unknown";
  }
};

export const getNetworkSettings = () => {
  switch (config.chainId) {
    // Ethereum
    case 1:
    // Rinkeby
    case 4: {
      return {
        realtimeSyncFrequencySeconds: 15,
        backfillBlockBatchSize: 16,
      };
    }

    // Goerli
    case 5: {
      return {
        realtimeSyncFrequencySeconds: 15,
        backfillBlockBatchSize: 128,
      };
    }

    // Optimism
    case 10: {
      return {
        realtimeSyncFrequencySeconds: 5,
        backfillBlockBatchSize: 512,
      };
    }

    default: {
      throw new Error("Unsupported chain id");
    }
  }
};
