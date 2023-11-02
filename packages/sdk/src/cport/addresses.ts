import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x7ca79c6f5040d97f66d9eba5accde49bc546d98d",
};

export const CPortEncoder: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x000000d75b0cf9bc3f3991b675483ac15c6091aa",
};

export const DomainSeparator: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x098502aac4fe0299b580a7b6a11fc0d4f3232669134b6206dd3e1b374ea2c994",
};
