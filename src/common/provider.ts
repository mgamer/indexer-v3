import {
  JsonRpcBatchProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls

export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl,
  config.chainId
);

export const baseBatchProvider = new JsonRpcBatchProvider(
  config.baseNetworkHttpUrl,
  config.chainId
);
