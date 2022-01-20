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

// Default Arweave gateway
export const arweaveGateway = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});
