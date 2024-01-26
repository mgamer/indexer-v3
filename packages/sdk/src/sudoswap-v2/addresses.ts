import { ChainIdToAddress, Network } from "../utils";

export const PairFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa020d57ab0448ef74115c112d18a9c231cc86000",
  [Network.EthereumGoerli]: "0x967544b2dd5c1c7a459e810c9b60ae4fc8227201",
  [Network.Base]: "0x605145d263482684590f630e9e581b21e4938eb8",
};

export const VeryFastRouter = {
  [Network.Ethereum]: "0x090c236b62317db226e6ae6cd4c0fd25b7028b65",
  [Network.EthereumGoerli]: "0xb3d6192e9940bba479c32596431d215faee5f723",
  [Network.Base]: "0xa07ebd56b361fe79af706a2bf6d8097091225548",
};

export const Router: ChainIdToAddress = {
  [Network.Ethereum]: "0x844d04f79d2c58dcebf8fff1e389fccb1401aa49",
};
