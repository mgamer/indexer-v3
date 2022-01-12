import {
  CloudflareProvider,
  AlchemyProvider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";
import Arweave from "arweave";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls
// - use free RPC endpoints for non-critical queries (eg. Cloudflare, Etherscan)
export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);

// Cloudflare provides a very reliable RPC endpoint but unfortunately
// it's only available on mainnet. For other chains we fallback to using
// the free Alchemy endpoint provided by ethers.
export const altProvider =
  config.chainId === 1
    ? new CloudflareProvider(config.chainId)
    : new AlchemyProvider(config.chainId);

// Default Arweave gateway
export const arweaveGateway = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});
