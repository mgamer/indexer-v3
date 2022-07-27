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
  const washTradingExcludedContracts: string[] = [];

  const defaultNetworkSettings = {
    realtimeSyncFrequencySeconds: 15,
    backfillBlockBatchSize: 16,
    washTradingExcludedContracts,
  };

  let networkSettings = {};

  switch (config.chainId) {
    // Goerli
    case 5: {
      networkSettings = {
        backfillBlockBatchSize: 128,
      };
      break;
    }
    // Optimism
    case 10: {
      networkSettings = {
        realtimeSyncFrequencySeconds: 5,
        backfillBlockBatchSize: 512,
      };
      break;
    }
    // Ethereum
    case 1:
      networkSettings = {
        washTradingExcludedContracts: [
          // ArtBlocks Contracts
          "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
          "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270",
        ],
      };
      break;
    // Rinkeby
    case 4:
    // Default
    default:
      break;
  }

  return Object.assign(defaultNetworkSettings, networkSettings);
};
