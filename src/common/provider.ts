import {
  EtherscanProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";

import { config } from "@config";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls

export const etherscanProvider = new EtherscanProvider(config.chainId);
export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);
export const orderbookProvider = new StaticJsonRpcProvider(
  config.orderbookNetworkHttlUrl
);
