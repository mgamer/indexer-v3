import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "createdotfun";

const BasicMintModule = "0x000000000f30984de6843bbc1d109c95ea6242ac";

export const extractByCollection = async (
  collection: string,
  module: string
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];
  try {
    const mintModule = new Contract(
      module,
      new Interface([
        `function configuration(address _contract) external view returns (
          (
            uint256 price,
            uint64 mintStart,
            uint64 mintEnd,
            uint32 maxPerWallet,
            uint32 maxPerTransaction,
            uint32 maxForModule,
            uint32 maxSupply,
          ) config
        )`,
      ]),
      baseProvider
    );

    const configuration = await mintModule.configuration(collection);
    const price = configuration.price.toString();
    const maxSupply = configuration.maxSupply.toString();
    const maxPerWallet = configuration.maxPerWallet.toString();

    results.push({
      collection,
      contract: collection,
      stage: `claim-${module.toLowerCase()}-${collection}`,
      kind: "public",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: module,
          data: {
            // `mint`
            signature: "0x00000000",
            params: [
              {
                kind: "contract",
                abiType: "address",
              },
              {
                kind: "recipient",
                abiType: "address",
              },
              {
                kind: "referrer",
                abiType: "address",
              },
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
      maxMintsPerWallet: maxPerWallet === "0" ? undefined : maxPerWallet,
      maxSupply: maxSupply === "0" ? undefined : maxSupply,
      startTime: toSafeTimestamp(configuration.mintStart),
      endTime: toSafeTimestamp(configuration.mintEnd),
    });
  } catch {
    // Skip errors
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

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0x00000000", // `mint`
    ].some((bytes4) => tx.data.startsWith(bytes4)) &&
    tx.to === BasicMintModule
  ) {
    return extractByCollection(collection, tx.to);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { collection } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection, BasicMintModule);
    for (const collectionMint of latestCollectionMints) {
      await simulateAndUpsertCollectionMint(collectionMint);
    }

    // Assume anything that exists in our system but was not returned
    // in the above call is not available anymore so we can close
    for (const existing of existingCollectionMints) {
      if (
        !latestCollectionMints.find(
          (latest) => latest.collection === existing.collection && latest.stage === existing.stage
        )
      ) {
        await simulateAndUpsertCollectionMint({
          ...existing,
          status: "closed",
        });
      }
    }
  }
};

type ProofValue = string;

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string,
  referrer: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${address}`;

  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(`https://mint.fun/api/mintfun/fundrop/mint?address=${address}&referrer=${referrer}`)
      .then(({ data }: { data: { signature: string } }) => data.signature);

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
    }
  }

  return result;
};
