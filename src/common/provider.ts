import {
  CloudflareProvider,
  EtherscanProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls
// - use free rpc endpoints for non-critical queries (eg. Cloudflare, Etherscan)

export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);
export const orderbookProvider = new StaticJsonRpcProvider(
  config.orderbookNetworkHttlUrl
);

export const altProvider =
  config.chainId === 1
    ? new CloudflareProvider(config.chainId)
    : new EtherscanProvider(config.chainId);
