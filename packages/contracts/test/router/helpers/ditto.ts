import { Contract } from "@ethersproject/contracts";

import { ethers } from "hardhat";

import * as Sdk from "../../../../sdk/src";
import abiErc20 from "../../../../sdk/src/common/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/common/abis/Erc721.json";
import abiDittoPoolFactory from "../../../../sdk/src/ditto/abis/DittoPoolFactory.json";
import { getChainId } from "../../utils";

export const getDittoContracts = () => {
  const chainId = getChainId();

  const testNftAddress = ethers.utils.getAddress(Sdk.Ditto.Addresses.Test721[chainId]);
  const nft: Contract = new Contract(testNftAddress, abiErc721, ethers.provider);

  const mintStanza = {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "idOrAmount",
        type: "uint256",
      },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  };
  abiErc20.push(mintStanza as any);
  const testTokenAddress = ethers.utils.getAddress(Sdk.Ditto.Addresses.Test20[chainId]);
  const token: Contract = new Contract(testTokenAddress, abiErc20, ethers.provider);

  const dittoPoolFactoryAddress = ethers.utils.getAddress(
    Sdk.Ditto.Addresses.DittoPoolFactory[chainId]
  );
  const dittoPoolFactory: Contract = new Contract(
    dittoPoolFactoryAddress,
    abiDittoPoolFactory,
    ethers.provider
  );

  return { nft, token, dittoPoolFactory };
};
