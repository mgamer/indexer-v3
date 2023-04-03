import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x7374FE94e34c209616cEc0610212DE13151D222f",
  [Network.EthereumGoerli]: "0x7374FE94e34c209616cEc0610212DE13151D222f",
};

export const OpenseaConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000001",
  [Network.EthereumGoerli]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000001",
};
