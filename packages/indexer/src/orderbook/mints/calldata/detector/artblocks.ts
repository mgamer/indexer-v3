import { Interface, Result } from "@ethersproject/abi";
import { hexZeroPad } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import { MerkleTree } from "merkletreejs";
import { BigNumber } from "@ethersproject/bignumber";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  CollectionMintStatusReason,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import {
  AllowlistItem,
  getAllowlist,
  allowlistExists,
  createAllowlist,
} from "@/orderbook/mints/allowlists";
import { fetchMetadata, getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import { now } from "@/common/utils";

const STANDARD = "artblocks";

export type Info = {
  projectId: number;
};

const MINTER_TYPES = {
  SET_PRICE_V4: "MinterSetPriceV4",
  DA_EXP_SETTLEMENT_V1: "MinterDAExpSettlementV1",
};

interface ProjectInfo {
  invocations: BigNumber;
  maxInvocations: BigNumber;
  active: boolean;
  paused: boolean;
  completedTimestamp: BigNumber;
  locked: boolean;
}
interface MinterTypePriceInfo {
  isConfigured: boolean;
  tokenPriceInWei: BigNumber;
  currencySymbol: string;
  currencyAddress: string;
}

export const extractByCollectionERC721 = async (
  collection: string,
  info: Info
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const { projectId } = info;

  // we will need info from collection about the projectId
  const projectHolder = new Contract(
    collection,
    new Interface([
      `function minterContract() external view returns (address)`,
      `function projectStateData(uint256 _projectId) external view
        returns (
            uint256 invocations,
            uint256 maxInvocations,
            bool active,
            bool paused,
            uint256 completedTimestamp,
            bool locked
        )
      `,
    ]),
    baseProvider
  );

  const projectInfo: ProjectInfo = await projectHolder.projectStateData(projectId);

  // we will also need info from MinterFilter, about the projectId
  const minterFilterAddress = await projectHolder.minterContract();
  const minterFilter = new Contract(
    minterFilterAddress,
    new Interface([
      `function getMinterForProject(uint256 _projectId) external view returns (address)`,
    ]),
    baseProvider
  );

  let minterAddressForProject: string | null = null;

  try {
    // getMinterForProject will revert if project minter not set!
    minterAddressForProject = await minterFilter.getMinterForProject(projectId);
  } catch (e) {}

  // if there is no minter set, there is not minting phase available
  // for this project id
  if (minterAddressForProject === null) {
    return results;
  }

  // let's get the minter itself
  const minterTypeContract = new Contract(
    minterAddressForProject,
    new Interface([
      `function minterType() external view returns (string memory)`,
      `function getPriceInfo(uint256 _projectId) external view returns (
        bool isConfigured,
        uint256 tokenPriceInWei,
        string memory currencySymbol,
        address currencyAddress
       )`,
    ]),
    baseProvider
  );

  const minterType = await minterTypeContract.minterType();
  const priceInfo: MinterTypePriceInfo = await minterTypeContract.getPriceInfo(projectId);

  const isOpen =
    projectInfo.active &&
    !projectInfo.paused &&
    !projectInfo.locked &&
    projectInfo.maxInvocations.gt(projectInfo.invocations);

  let statusReason: CollectionMintStatusReason | undefined = undefined;
  if (!isOpen) {
    if (projectInfo.maxInvocations.lte(projectInfo.invocations)) {
      statusReason = "max-supply-exceeded";
    }
  }

  // console.log(minterType, priceInfo);

  if (
    minterType === MINTER_TYPES.SET_PRICE_V4 ||
    minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1
  ) {
    if (priceInfo.isConfigured) {
      const result: CollectionMint = {
        collection,
        contract: collection,
        stage: `public-sale-artblocks-${collection}-${projectId}`,
        kind: "public",
        status: isOpen ? "open" : "closed",
        statusReason,
        standard: STANDARD,
        details: {
          tx: {
            to: minterAddressForProject,
            data: {
              // "purchaseTo_do6"
              signature: "0x00009987",
              params: [
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: projectId,
                },
              ],
            },
          },
        },
        currency: priceInfo.currencyAddress,
        price: priceInfo.tokenPriceInWei.toString(),
        maxSupply: projectInfo.maxInvocations.toString(),
      };

      // if da with settlement, get timestampStart
      if (minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1) {
        const minterContract = new Contract(
          minterAddressForProject,
          new Interface([
            `function projectAuctionParameters(uint256 _projectId)
            external
            view
            returns (
                uint256 timestampStart,
                uint256 priceDecayHalfLifeSeconds,
                uint256 startPrice,
                uint256 basePrice
            )`,
          ]),
          baseProvider
        );
        const daInfo = await minterContract.projectAuctionParameters(projectId);

        result.startTime = daInfo.timestampStart.toNumber();

        if (daInfo.timestampStart.toNumber() > now()) {
          result.status = "closed";
          result.statusReason = "not-yet-started";
        }
      }

      results.push(result);
    }
  }

  return results;
};
