import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x503d80ba1ad322220a48953d96c782a65488bd3a",
};

export const CPortEncoder: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x00000052abef542ef6dd144ffdd4942f1eaf30ba",
};

export const DomainSeparator: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x30334acc1fbf29218669c223122902705a380853e41256cec9d8a7bc4163b292",
};
