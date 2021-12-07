import {
  CloudflareProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls
// - use Cloudflare's free rpc endpoint for non-critical queries

export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);
export const orderbookProvider = new StaticJsonRpcProvider(
  config.orderbookNetworkHttlUrl
);

export const cloudflareProvider = new CloudflareProvider(config.chainId);
