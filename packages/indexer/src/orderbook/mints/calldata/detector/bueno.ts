import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "bueno";

export type Info = {
  phaseIndex?: number;
};

export const extractByCollectionERC721 = async (
  collection: string,
  phaseIndex?: number
): Promise<CollectionMint[]> => {
  const contract = new Contract(
    collection,
    new Interface([
      `function getDataForPhase(uint256 phaseIndex) view returns (
        (
          uint64 maxSupply,
          uint64 amountMinted,
          uint64 maxPerWallet,
          bytes32 merkleRoot,
          bool isActive,
          uint256 price
        )
      )`,
      `function baseSettings() view returns (
        (
          uint64 maxSupply,
          uint64 maxPerWallet,
          uint64 amountMinted,
          uint256 price
        )
      )`,
      `function isPublicActive() view returns (bool)`,
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    if (phaseIndex !== undefined) {
      const { maxSupply, maxPerWallet, merkleRoot, price, isActive } =
        await contract.getDataForPhase(phaseIndex);

      const supply = maxSupply.toString();

      if (merkleRoot === HashZero) {
        results.push({
          collection,
          contract: collection,
          stage: `public-phase-${phaseIndex}`,
          kind: "public",
          status: isActive && supply !== "0" ? "open" : "closed",
          standard: STANDARD,
          details: {
            tx: {
              to: collection,
              data: {
                // `mintPhase`
                signature: "0xdb980f4f",
                params: [
                  {
                    kind: "unknown",
                    abiType: "uint256",
                    abiValue: phaseIndex,
                  },
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                ],
              },
            },
            info: {
              phaseIndex,
            },
          },
          currency: Sdk.Common.Addresses.Native[config.chainId],
          price: price.toString(),
          maxMintsPerWallet: toSafeNumber(maxPerWallet),
          maxSupply: toSafeNumber(maxSupply),
        });
      }
    } else {
      const isPublicActive = await contract.isPublicActive();
      const { maxSupply, maxPerWallet, price } = await contract.baseSettings();
      results.push({
        collection,
        contract: collection,
        stage: `public-sale`,
        kind: "public",
        status: isPublicActive ? "open" : "closed",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // `mintPublic`
              signature: "0x0d1d7ae5",
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
        price: price.toString(),
        maxMintsPerWallet: toSafeNumber(maxPerWallet),
        maxSupply: toSafeNumber(maxSupply),
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason ?? cm.statusReason;
      });
    })
  );

  return results;
};

export const extractByCollectionERC1155 = async (
  collection: string,
  tokenId: string
): Promise<CollectionMint[]> => {
  const contract = new Contract(
    collection,
    new Interface([
      `function getTokenSettingsByTokenId(
        uint256 id
        ) view returns (
          (
            uint32 maxSupply,
            uint32 maxPerWallet,
            uint32 amountMinted,
            bytes32 merkleRoot,
            uint32 mintStart,
            uint32 mintEnd,
            uint256 price,
            string uuid,
            (
              address[] payees,
              uint256[] shares
            )
          )
      )`,
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    const { maxSupply, maxPerWallet, merkleRoot, mintStart, mintEnd, price } =
      await contract.getTokenSettingsByTokenId(tokenId);

    // Public sale
    if (merkleRoot === HashZero) {
      results.push({
        collection,
        contract: collection,
        stage: `public-sale-${tokenId}`,
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // `mintToken`
              signature: "0x82f57d27",
              params: [
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: tokenId,
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
        price: price.toString(),
        tokenId,
        maxMintsPerWallet: toSafeNumber(maxPerWallet),
        maxSupply: toSafeNumber(maxSupply),
        startTime: toSafeTimestamp(mintStart),
        endTime: toSafeTimestamp(mintEnd),
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason ?? cm.statusReason;
      });
    })
  );

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  const iface1155 = new Interface([
    "function mintToken(uint256 id, uint32 quantity) payable",
    "function mintTokenTo(address account,uint256 id,uint32 quantity) payable",
  ]);

  const iface721 = new Interface([
    "function mintPhase(uint256 phaseIndex, uint64 quantity) payable",
    "function mintPhaseTo(address account, uint256 phaseIndex, uint64 quantity) payable",
    "function mintPublic(uint64 quantity) payable",
    "function mintPublicTo(address account, uint64 quantity) payable",
  ]);

  const found1155 = iface1155.fragments.find((fragment) => {
    return tx.data.startsWith(iface1155.getSighash(fragment));
  });

  const found721 = iface721.fragments.find((fragment) => {
    return tx.data.startsWith(iface721.getSighash(fragment));
  });

  // ERC721
  if (found721) {
    const data = iface721.decodeFunctionData(found721.name, tx.data);

    let phaseIndex: undefined | number;
    if (data.phaseIndex !== undefined) {
      phaseIndex = data.phaseIndex.toNumber();
    }

    return extractByCollectionERC721(collection, phaseIndex);
  } else if (found1155) {
    const data = iface1155.decodeFunctionData(found1155.name, tx.data);
    const tokenId = data.id.toString();

    return extractByCollectionERC1155(collection, tokenId);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { tokenId, details } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = tokenId
      ? await extractByCollectionERC1155(collection, tokenId)
      : await extractByCollectionERC721(collection, (details.info as Info)?.phaseIndex);
    for (const collectionMint of latestCollectionMints) {
      await simulateAndUpsertCollectionMint(collectionMint);
    }

    // Assume anything that exists in our system but was not returned
    // in the above call is not available anymore so we can close
    for (const existing of existingCollectionMints) {
      if (
        !latestCollectionMints.find(
          (latest) =>
            latest.collection === existing.collection &&
            latest.stage === existing.stage &&
            latest.tokenId === existing.tokenId
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
