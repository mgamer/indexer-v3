import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x6170b3c3a54c3d8c854934cbc314ed479b2b29a3",
  [Network.EthereumGoerli]: "0xd8be3e8a8648c4547f06e607174bac36f5684756",
  [Network.Polygon]: "0x3634e984ba0373cfa178986fd19f03ba4dd8e469",
  [Network.EvmosTestnet]: "0xE49a78aafcAFA57a7795B42A68b7b02D7f481baC",
};

export const AuctionHouse: ChainIdToAddress = {
  [Network.Ethereum]: "0xe468ce99444174bd3bbbed09209577d25d1ad673",
};

export const ModuleManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x850a7c6fe2cf48eea1393554c8a3ba23f20cc401",
  [Network.EthereumGoerli]: "0x9458e29713b98bf452ee9b2c099289f533a5f377",
  [Network.Polygon]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
  [Network.EvmosTestnet]: "0x6779178Ba139A61890A0B05a15045dF2ED0ae2dd",
};

export const Erc721TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
  [Network.EthereumGoerli]: "0xd1adaf05575295710de1145c3c9427c364a70a7f",
  [Network.Polygon]: "0xce6cef2a9028e1c3b21647ae3b4251038109f42a",
  [Network.EvmosTestnet]: "0x7a56178610624943aeDF11Ce7b7C9d991aFBCc36",
};

export const Erc20TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
  [Network.EthereumGoerli]: "0x53172d999a299198a935f9e424f9f8544e3d4292",
  [Network.Polygon]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
  [Network.EvmosTestnet]: "0xE30E6Fb2c7f2A24a770cfa7E2c31a989D24AC616",
};

export const ERC1155Factory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa6c5f2de915240270dac655152c3f6a91748cb85",
  [Network.Optimism]: "0x78b524931e9d847c40bcbf225c25e154a7b05fda",
  [Network.Zora]: "0x35ca784918bf11692708c1d530691704aacea95e",
};

export const ERC1155FactoryV2: ChainIdToAddress = {
  [Network.Ethereum]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Optimism]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Zora]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
};
