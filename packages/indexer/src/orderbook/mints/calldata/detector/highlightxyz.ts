import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

const STANDARD = "highlightxyz";

export interface Info {
  vectorId: number | string;
}

export interface CustomInfo extends Info {
  prices?: string[];
  pricePeriodDuration?: number;
  lowestPriceIndex?: number;
}

// export interface DAConfigInfo {
//   timestampStart: number;
//   priceDecayHalfLifeSeconds: number;
//   startPrice: string;
//   basePrice: string;
// }

// interface ProjectInfo {
//   invocations: BigNumber;
//   maxInvocations: BigNumber;
//   active: boolean;
//   paused: boolean;
//   completedTimestamp: BigNumber;
//   locked: boolean;
// }

interface MechanicVectorMetadata {
  contractAddress: string;
  editionId: number;
  mechanic: string;
  isEditionBased: boolean;
  isChoose: boolean;
  paused: boolean;
}

interface AbridgedVector {
  contractAddress: string;
  startTimestamp: number;
  endTimestamp: number;
  paymentRecipient: string;
  maxTotalClaimableViaVector: number;
  totalClaimedViaVector: number;
  currency: string;
  tokenLimitPerTx: number;
  maxUserClaimableViaVector: number;
  pricePerToken: BigNumber;
  editionId: number;
  editionBasedCollection: boolean;
  requireDirectEOA: boolean;
  allowlistRoot: string;
}

interface DAMechanicRawVector {
  startTimestamp: number;
  endTimestamp: number;
  periodDuration: number;
  maxUserClaimableViaVector: number;
  maxTotalClaimableViaVector: number;
  currentSupply: number;
  lowestPriceSoldAtIndex: number;
  tokenLimitPerTx: number;
  numPrices: number;
  paymentRecipient: string;
  totalSales: BigNumber;
  bytesPerPrice: number;
  auctionExhausted: boolean;
  payeeRevenueHasBeenWithdrawn: boolean;
}

interface DAMechanicState {
  rawVector: DAMechanicRawVector;
  prices: BigNumber[];
  currentPrice: BigNumber;
  payeePotentialEscrowedFunds: BigNumber;
  collectionSupply: BigNumber;
  collectionSize: BigNumber;
  escrowedFundsAmountFinalized: boolean;
  auctionExhausted: boolean;
  auctionInFPP: boolean;
}

export const mintManagerInterface = new Interface([
  `function getAbridgedVector(uint256 vectorId) external view returns (
    address contractAddress,
    uint48 startTimestamp,
    uint48 endTimestamp,
    address paymentRecipient,
    uint48 maxTotalClaimableViaVector,
    uint48 totalClaimedViaVector,
    address currency,
    uint48 tokenLimitPerTx,
    uint48 maxUserClaimableViaVector,
    uint192 pricePerToken,
    uint48 editionId,
    bool editionBasedCollection,
    bool requireDirectEOA,
    bytes32 allowlistRoot
  )`,
  `function mechanicVectorMetadata(bytes32) external view returns (
    address contractAddress,
    uint96 editionId,
    address mechanic,
    bool isEditionBased,
    bool isChoose,
    bool paused
  )`,
  `function mechanicMintNum(
    bytes32 vectorId,
    address recipient,
    uint32 numToMint,
    bytes calldata data
  ) external payable`,
  `function vectorMint721(uint256 vectorId, uint48 numTokensToMint, address mintRecipient) external payable`,
]);

export const extractByCollectionERC721 = async (
  collection: string,
  info: Info
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const { vectorId } = info;

  const mintManagerAddress = Sdk.HighlightXYZ.Addresses.MintManager[config.chainId];

  // We will need information from the collection about the project id
  const mintManager = new Contract(mintManagerAddress, mintManagerInterface, baseProvider);

  // first we need to find the Vector configuration. It can either be an "AbridgedVector" or a "MechanicVector"
  // AbridgedVector means the minter will mint directly on the collection and all the configuration of the mint is in that
  // vector
  // MechanicVector means the minter will call another contract which will process the data, similar to the "Strategy" pattern
  // that allows DA and other strategies to be added latter to the main minter contract
  try {
    // AbridgedVector ids are integers, MechanicVector are bytes32, we can detect which one it is by checking if vectorId starts with 0x
    if (!String(vectorId).startsWith("0x")) {
      const vector: AbridgedVector = await mintManager.getAbridgedVector(vectorId);

      // vector is not for that collection
      if (vector.contractAddress.toLocaleLowerCase() != collection) {
        return [];
      }

      const startTimestamp = toSafeTimestamp(vector.startTimestamp);
      const endTimestamp = toSafeTimestamp(vector.endTimestamp);
      const totalClaimedViaVector = vector.totalClaimedViaVector;
      const maxTotalClaimableViaVector = vector.maxTotalClaimableViaVector;
      const maxUserClaimableViaVector = vector.maxUserClaimableViaVector;
      const currency = vector.currency;
      const price = vector.pricePerToken.toString();
      const tokenLimitPerTx = vector.tokenLimitPerTx;

      const isOpen = maxTotalClaimableViaVector <= totalClaimedViaVector;

      const item: CollectionMint = {
        collection,
        contract: collection,
        stage: `public-highlight-${vectorId}`,
        kind: "public",
        status: isOpen ? "open" : "closed",
        standard: STANDARD,
        details: {
          tx: {
            to: mintManager.address,
            data: {
              signature: mintManager.interface.getSighash("vectorMint721"),
              params: [
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: vectorId,
                },
                {
                  kind: "quantity",
                  abiType: "uint48",
                },
                {
                  kind: "recipient",
                  abiType: "address",
                },
              ],
            },
          },
          info: {
            vectorId,
          },
        },
        maxSupply: maxTotalClaimableViaVector != 0 ? String(maxTotalClaimableViaVector) : undefined,
        maxMintsPerWallet:
          maxUserClaimableViaVector != 0 ? String(maxUserClaimableViaVector) : undefined,
        startTime: startTimestamp != 0 ? startTimestamp : undefined,
        endTime: endTimestamp != 0 ? endTimestamp : undefined,
        currency,
        price,
        maxPerTransaction: tokenLimitPerTx != 0 ? String(tokenLimitPerTx) : undefined,
      };

      results.push(item);
    } else {
      // "Mechanics" are equivalent to the "Strategy" pattern
      const vector: MechanicVectorMetadata = await mintManager.mechanicVectorMetadata(vectorId);

      await tryDetectDutchAuction(results, mintManager, collection, String(vectorId), vector);
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason;
      });
    })
  );

  return results;
};

async function tryDetectDutchAuction(
  results: CollectionMint[],
  mintManager: Contract,
  collection: string,
  vectorId: string,
  vector: MechanicVectorMetadata
): Promise<void> {
  // for the moment we only know of one strategy: DiscreteDutchAuctionMechanic
  const daAddress = Sdk.HighlightXYZ.Addresses.DiscreteDutchAuctionMechanic[config.chainId];

  // it doesn't exist on some chains
  if (!daAddress) {
    return;
  }

  // if it's not the DA, we don't know about it, throw an error?
  if (vector.mechanic.toLocaleLowerCase() != daAddress) {
    // @todo is there any other method to tell reservoir there is a new strategy to add?
    throw new Error(`Unknown mechanic for ${STANDARD} mechanic ${vector.mechanic}`);
  }

  // else we get all data from DA and add the mint strategy to the results
  const daContract = new Contract(
    daAddress,
    new Interface([
      `function getVectorState(
        bytes32 mechanicVectorId
      )
        external
        view
        returns (
            tuple(
              uint48 startTimestamp,
              uint48 endTimestamp,
              uint32 periodDuration,
              uint32 maxUserClaimableViaVector,
              uint48 maxTotalClaimableViaVector,
              uint48 currentSupply,
              uint32 lowestPriceSoldAtIndex,
              uint32 tokenLimitPerTx,
              uint32 numPrices,
              address payable paymentRecipient,
              uint240 totalSales,
              uint8 bytesPerPrice,
              bool auctionExhausted,
              bool payeeRevenueHasBeenWithdrawn
            ) memory rawVector,
            uint200[] memory prices,
            uint200 currentPrice,
            uint256 payeePotentialEscrowedFunds,
            uint256 collectionSupply,
            uint256 collectionSize,
            bool escrowedFundsAmountFinalized,
            bool auctionExhausted,
            bool auctionInFPP
        )`,
    ]),
    baseProvider
  );

  const daState: DAMechanicState = await daContract.getVectorState(vectorId);

  const rawVector = daState.rawVector;

  // rawVector
  const startTimestamp = toSafeTimestamp(rawVector.startTimestamp);
  const endTimestamp = toSafeTimestamp(rawVector.endTimestamp);
  const currentSupply = rawVector.currentSupply;
  const maxUserClaimableViaVector = rawVector.maxUserClaimableViaVector;
  const tokenLimitPerTx = rawVector.tokenLimitPerTx;

  // mechanicVector
  const price = daState.currentPrice.toString();
  const maxSupply = daState.collectionSize.toNumber();

  const currency = Sdk.Common.Addresses.Native[config.chainId];

  const isOpen = currentSupply > 0;

  const item: CollectionMint = {
    collection,
    contract: collection,
    stage: `public-highlight-${vectorId}`,
    kind: "public",
    status: isOpen ? "open" : "closed",
    standard: STANDARD,
    details: {
      tx: {
        to: mintManager.address,
        data: {
          signature: mintManager.interface.getSighash("mechanicMintNum"),
          params: [
            {
              kind: "unknown",
              abiType: "bytes32",
              abiValue: vectorId,
            },
            {
              kind: "recipient",
              abiType: "address",
            },
            {
              kind: "quantity",
              abiType: "uint48",
            },
            {
              kind: "unknown",
              abiType: "bytes",
              abiValue: [],
            },
          ],
        },
      },
      info: {
        vectorId,
        // should allow to calculate price without needing to make an on-chain call
        prices: daState.prices.map((price) => price.toString()),
        pricePeriodDuration: rawVector.periodDuration,
        lowestPriceIndex: rawVector.lowestPriceSoldAtIndex,
      },
    },
    maxSupply: maxSupply != 0 ? String(maxSupply) : undefined,
    maxMintsPerWallet:
      maxUserClaimableViaVector != 0 ? String(maxUserClaimableViaVector) : undefined,
    startTime: startTimestamp != 0 ? startTimestamp : undefined,
    endTime: endTimestamp != 0 ? endTimestamp : undefined,
    currency,
    price,
    maxPerTransaction: tokenLimitPerTx != 0 ? String(tokenLimitPerTx) : undefined,
  };

  results.push(item);
}

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });
  // Dedupe by collection and project id
  const dedupedExistingMints = existingCollectionMints.filter((existing, index) => {
    return (
      index ===
      latestCollectionMints.findIndex((found) => {
        return (
          existing.collection === found.collection &&
          (existing.details.info! as Info).vectorId === (found.details.info! as Info).vectorId
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
  // Simulate the ones still available
  for (const collectionMint of latestCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }
  // Assume anything that exists in our system but was not returned
  // in the above call is not available anymore so we can close
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
  const signatures = [
    mintManagerInterface.getSighash("mechanicMintNum"),
    mintManagerInterface.getSighash("vectorMint721"),
  ];

  if (signatures.includes(tx.data.substring(0, 10))) {
    const result = mintManagerInterface.parseTransaction({ data: tx.data });
    if (result) {
      return extractByCollectionERC721(collection, { vectorId: result.args.vectorId });
    }
  }

  return [];
};
