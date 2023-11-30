import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import { baseProvider } from "@/common/provider";
import {
  CollectionMint,
  CollectionMintStatusReason,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { now } from "@/common/utils";
import { Transaction } from "@/models/transactions";

const STANDARD = "artblocks";

const MINTER_TYPES = {
  SET_PRICE_V4: "MinterSetPriceV4",
  DA_EXP_SETTLEMENT_V1: "MinterDAExpSettlementV1",
};

export interface Info {
  projectId: number;
  tokenId?: number;
  daConfig?: DAConfigInfo;
}

export interface DAConfigInfo {
  timestampStart: number;
  priceDecayHalfLifeSeconds: number;
  startPrice: string;
  basePrice: string;
}
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

  const { projectId, daConfig } = info;
  const collectionId = `${collection}:${projectId}000000:${projectId}999999`;

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
  } catch (e) {
    // @TODO handle if the error is the expected error (no minter for project)
    // or if the error is something else?
  }

  // we go further only if there is a minter associated with project
  if (minterAddressForProject !== null) {
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

    if (
      minterType === MINTER_TYPES.SET_PRICE_V4 ||
      minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1
    ) {
      const priceInfo: MinterTypePriceInfo = await minterTypeContract.getPriceInfo(projectId);
      if (priceInfo.isConfigured) {
        const result: CollectionMint = {
          collection: collectionId,
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
            info: {
              hasDynamicPrice: minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1,
              projectId,
            },
          },
          currency: priceInfo.currencyAddress,
          price: priceInfo.tokenPriceInWei.toString(),
          maxSupply: projectInfo.maxInvocations.toString(),
        };

        // if da with settlement, get timestampStart
        if (minterType === MINTER_TYPES.DA_EXP_SETTLEMENT_V1) {
          if (daConfig !== undefined) {
            // if it's a DA with settlement, and the config wasn't provided, we get the config
            (result.details.info! as Info).daConfig = daConfig;
          } else {
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

            const startTime = daInfo.timestampStart.toNumber();
            result.startTime = startTime;
            if (startTime > now()) {
              result.status = "closed";
              result.statusReason = "not-yet-started";
            }

            (result.details.info! as Info).daConfig = {
              timestampStart: startTime,
              priceDecayHalfLifeSeconds: daInfo.priceDecayHalfLifeSeconds.toNumber(),
              startPrice: daInfo.startPrice.toString(),
              basePrice: daInfo.basePrice.toString(),
            };
          }
        }
        results.push(result);
      }
    }
  }

  return results;
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });
  // we dedupe by projectId
  const dedupedExistingMints = existingCollectionMints.filter((existing, index) => {
    return (
      index ==
      latestCollectionMints.findIndex((found) => {
        return (
          existing.collection == found.collection &&
          (existing.details.info! as Info).projectId == (found.details.info! as Info).projectId
        );
      })
    );
  });
  let latestCollectionMints: CollectionMint[] = [];
  for (const { details } of dedupedExistingMints) {
    // Fetch the currently available mints
    latestCollectionMints = latestCollectionMints.concat(
      await extractByCollectionERC721(collection, details.info! as Info)
    );
  }
  // simulate the one still available
  for (const collectionMint of latestCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }
  // remove the existing ones not here anymore
  for (const existing of existingCollectionMints) {
    const stillExists = latestCollectionMints.find((latest) => {
      return (
        latest.collection == existing.collection &&
        latest.stage == existing.stage &&
        latest.kind == existing.kind
      );
    });
    if (!stillExists) {
      await simulateAndUpsertCollectionMint({
        ...existing,
        status: "closed",
      });
    }
  }
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  const iface = new Interface([
    "function purchase(uint256 projectId) external payable returns (uint256 tokenId)",
    "function purchase_H4M(uint256 projectId) external payable returns (uint256 tokenId)",
    "function purchaseTo(address _to, uint256 projectId) external payable returns (uint256 tokenId)",
    "function purchaseTo_do6(address _to, uint256 projectId) external payable returns (uint256 tokenId)",
  ]);

  const result = iface.parseTransaction({ data: tx.data });
  if (result && result?.args.projectId) {
    const projectId: number = result.args.projectId.toNumber();
    return extractByCollectionERC721(collection, { projectId });
  }

  return [];
};
