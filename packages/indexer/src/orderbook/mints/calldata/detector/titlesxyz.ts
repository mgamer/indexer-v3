import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { CollectionMint } from "@/orderbook/mints";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BigNumber } from "ethers";

const STANDARD = "titlesxyz";

/*
  Network: ZORA

  Factory:
  emit EditionPublished({
      creator: msg.sender,
      remixContractAddress: remixClone,
      creatorProceedRecipient: proceedRecipient,
      derivativeFeeRecipient: feeRecipient
  });

  EditionsV1:
  function purchase(uint256 quantity) external payable;

  Non editable:
  function price() external view (uint256)
  function maxSupply() external view (uint256)
  function mintLimitPerWallet() external view (uint256)
  function saleEndTime() external view (uint256)
*/

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  // we will need info from collection about the projectId
  const contract = new Contract(
    collection,
    new Interface([
      "function price() external view returns (uint256)",
      "function maxSupply() external view returns (uint256)",
      "function mintLimitPerWallet() external view returns (uint256)",
      "function saleEndTime() external view returns (uint256)",
    ]),
    baseProvider
  );

  const [price, maxSupply, mintLimitPerWallet, endTime]: [string, string, string, number] =
    await Promise.all([
      contract.price().then((res: BigNumber) => res.toString()),
      contract.maxSupply().then((res: BigNumber) => res.toString()),
      contract.mintLimitPerWallet().then((res: BigNumber) => res.toString()),
      contract.saleEndTime().then((res: BigNumber) => res.toNumber()),
    ]);

  const isOpen = endTime < now();

  results.push({
    collection,
    contract: collection,
    stage: `public-sale-${collection}`,
    kind: "public",
    status: isOpen ? "open" : "closed",
    standard: STANDARD,
    details: {
      tx: {
        to: collection,
        data: {
          // "purchase"
          signature: "0xefef39a1",
          params: [
            {
              kind: "quantity",
              abiType: "uint256",
            },
          ],
        },
      },
    },
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: price,
    maxSupply: maxSupply,
    maxMintsPerWallet: mintLimitPerWallet,
    endTime,
  });

  return results;
};
