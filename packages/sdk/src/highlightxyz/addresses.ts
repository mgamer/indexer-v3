import { ChainIdToAddress, Network } from "../utils";

export const MintManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x1bf979282181f2b7a640d17ab5d2e25125f2de5e",
  [Network.Base]: " 0x8087039152c472Fa74F47398628fF002994056EA",
};

export const DiscreteDutchAuctionMechanic: ChainIdToAddress = {
  [Network.Ethereum]: "0x94fa6e7fc2555ada63ea56cfff425558360f0074",
};
