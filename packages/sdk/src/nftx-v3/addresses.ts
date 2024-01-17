import { ChainIdToAddress, Network } from "../utils";

export const VaultFactory: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0x1d552A0e6c2f680872C4a88b1e7def05F1858dF0",
  [Network.EthereumSepolia]: "0x31C56CaF49125043e80B4d3C7f8734f949d8178C",
  [Network.Ethereum]: "0xC255335bc5aBd6928063F5788a5E420554858f01",
};

export const MarketplaceZap: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0x5A40C0288d23E83a23bb16C29B790F7e49e49ee6",
  [Network.EthereumSepolia]: "0xd88a3B9D0Fb2d39ec8394CfFD983aFBB2D4a6410",
  [Network.Ethereum]: "0x293A0c49c85F1D8851C665Ac3cE1f1DC2a79bE3d",
};

export const NFTXUniversalRouter: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0xF7c4FC5C2e30258e1E4d1197fc63aeDE371508f3",
  [Network.EthereumSepolia]: "0x12156cCA1958B6591CC49EaE03a5553458a4b424",
  [Network.Ethereum]: "0x250d62a67254A46c0De472d2c9215E1d890cC90f",
};

export const CreateVaultZap: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0x040fE06ABc3c099772DEe413dE138937bf053543",
  [Network.EthereumSepolia]: "0xD80b916470F8e79FD8d09874cb159CbB8D13d8da",
  [Network.Ethereum]: "0x56dab32697B4A313f353DA0CE42B5113eD8E6f74",
};

export const QuoterV2: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0xBb473dbEF3363b5d7CDD5f12429Fd1C5F0c10499",
  [Network.EthereumSepolia]: "0xb8EB27ca4715f7A04228c6F83935379D1f5AbABd",
  [Network.Ethereum]: "0x5493dF723c17B6A768aA61F79405bA56ffC5294a",
};

export const NFTXV3Module: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0xfe6A828fF94A0F027402A56711F71526593422e5",
  [Network.EthereumSepolia]: "0xfe6a828ff94a0f027402a56711f71526593422e5",
  // [Network.Ethereum]: "0xfe6a828ff94a0f027402a56711f71526593422e5",
};
