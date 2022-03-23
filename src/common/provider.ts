import { StaticJsonRpcProvider } from "@ethersproject/providers";
import Arweave from "arweave";

import { config } from "@/config/index";

// Optimizations:
// - use http everywhere since websockets are much more expensive
// - use static providers to avoid redundant `eth_chainId` calls

export const baseProvider = new StaticJsonRpcProvider(config.baseNetworkHttpUrl, config.chainId);

export const arweaveGateway = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export const network = config.chainId === 1 ? "mainnet" : "rinkeby";
