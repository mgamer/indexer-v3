import {
  CloudflareProvider,
  EtherscanProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls
// - use free RPC endpoints for non-critical queries (eg. Cloudflare, Etherscan)

export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);
export const orderbookProvider = new StaticJsonRpcProvider(
  config.orderbookNetworkHttlUrl
);

// Cloudflare provides a very reliable RPC endpoint but unfortunately
// it's only available on mainnet. For other chains we fallback to using
// Etherscan which has restrictive rate-limits but it still does the job.
export const altProvider =
  config.chainId === 1
    ? new CloudflareProvider(config.chainId)
    : new EtherscanProvider(config.chainId);
