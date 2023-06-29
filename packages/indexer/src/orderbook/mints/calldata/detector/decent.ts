import { Interface } from "@ethersproject/abi";
import { HashZero, MaxUint256 } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { keccak256 } from "@ethersproject/keccak256";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import MerkleTree from "merkletreejs";
import { parseEther } from "ethers/lib/utils";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import {
  AllowlistItem,
  allowlistExists,
  createAllowlist,
  getAllowlist,
} from "@/orderbook/mints/allowlists";

const STANDARD = "decent";

export type Info = {
  merkleTreeId?: string;
};

const hashFn = (item: AllowlistItem) =>
  solidityKeccak256(
    ["address", "uint256", "uint256"],
    [item.address, item.maxMints ?? 0, item.price ?? MaxUint256]
  );

const generateMerkleTree = (
  items: AllowlistItem[]
): {
  root: string;
  tree: MerkleTree;
} => {
  // Reference:
  // https://docs.decent.xyz/docs/editions#deploy

  const tree = new MerkleTree(items.map(hashFn), keccak256, {
    sortPairs: true,
  });
  return {
    root: tree.getHexRoot(),
    tree,
  };
};

export const extractByCollection = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  // DCNT721A
  const ABIV6 = new Interface([
    `function MAX_TOKENS() external view returns(uint256)`,
    `function tokenPrice() external view returns(uint256)`,
    `function maxTokenPurchase() external view returns(uint256)`,
    `function saleStart() external view returns(uint256)`,
    `function saleEnd() external view returns(uint256)`,
    `function royaltyBPS() external view returns(uint256)`,
    `function presaleStart() external view returns(uint256)`,
    `function presaleEnd() external view returns(uint256)`,
    `function presaleMerkleRoot() external view returns(bytes32)`,
  ]);

  const ABIV8 = new Interface([
    `function MAX_TOKENS() external view returns(uint256)`,
    `function edition() external view returns (
      bool hasAdjustableCap,
      bool isSoulbound,
      uint32 maxTokens,
      uint32 maxTokenPurchase,
      uint32 presaleStart,
      uint32 presaleEnd,
      uint32 saleStart,
      uint32 saleEnd,
      uint16 royaltyBPS,
      uint96 tokenPrice,
      address payoutAddress,
      bytes32 presaleMerkleRoot
    )`,
  ]);

  const contract = new Contract(
    collection,
    new Interface([`function contractVersion() external view returns (uint32)`]),
    baseProvider
  );

  try {
    const version = await contract.contractVersion();
    // DCNT721A v8 looks like is under development
    let editionConfig: {
      maxTokens: string;
      tokenPrice: string;
      maxTokenPurchase: string;
      saleStart: string;
      saleEnd: string;
      royaltyBPS: string;
      presaleStart: string;
      presaleEnd: string;
      presaleMerkleRoot: string;
    };

    if (version < 8) {
      const nft = new Contract(collection, ABIV6, baseProvider);
      const [
        maxTokens,
        tokenPrice,
        maxTokenPurchase,
        saleStart,
        saleEnd,
        royaltyBPS,
        presaleStart,
        presaleEnd,
        presaleMerkleRoot,
      ] = await Promise.all([
        nft.MAX_TOKENS(),
        nft.tokenPrice(),
        nft.maxTokenPurchase(),
        nft.saleStart(),
        nft.saleEnd(),
        nft.royaltyBPS(),
        nft.presaleStart(),
        nft.presaleEnd(),
        nft.presaleMerkleRoot(),
      ]);

      editionConfig = {
        maxTokens: maxTokens.toString(),
        tokenPrice: tokenPrice.toString(),
        maxTokenPurchase: maxTokenPurchase.toString(),
        saleStart: saleStart.toString(),
        saleEnd: saleEnd.toString(),
        royaltyBPS: royaltyBPS.toString(),
        presaleStart: presaleStart.toString(),
        presaleEnd: presaleEnd.toString(),
        presaleMerkleRoot,
      };
    } else {
      const nft = new Contract(collection, ABIV8, baseProvider);
      const config = await nft.edition();
      editionConfig = {
        maxTokens: config.maxTokens.toString(),
        tokenPrice: config.tokenPrice.toString(),
        maxTokenPurchase: config.maxTokenPurchase.toString(),
        saleStart: config.saleStart.toString(),
        saleEnd: config.saleEnd.toString(),
        royaltyBPS: config.royaltyBPS.toString(),
        presaleStart: config.presaleStart.toString(),
        presaleEnd: config.presaleEnd.toString(),
        presaleMerkleRoot: config.presaleMerkleRoot,
      };
    }

    results.push({
      collection,
      contract: collection,
      stage: "public-sale",
      kind: "public",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: collection,
          data: {
            // `mint`
            signature: "0x40c10f19",
            params: [
              {
                kind: "recipient",
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
      currency: Sdk.Common.Addresses.Eth[config.chainId],
      price: editionConfig.tokenPrice,
      maxMintsPerWallet: editionConfig.maxTokenPurchase,
      maxSupply: editionConfig.maxTokens,
      startTime:
        editionConfig.saleStart != "0" ? toSafeTimestamp(editionConfig.saleStart) : undefined,
      endTime: editionConfig.saleEnd != "0" ? toSafeTimestamp(editionConfig.saleEnd) : undefined,
    });

    // Allowlist sale
    if (editionConfig.presaleMerkleRoot !== HashZero) {
      try {
        let allowlistCreated = true;
        if (!(await allowlistExists(editionConfig.presaleMerkleRoot))) {
          // Fetch allowlist, it could be failed
          const { data } = await axios.get(
            `https://hq.decent.xyz/api/1.0/allowlists/${editionConfig.presaleMerkleRoot}`,
            {
              headers: {
                "x-api-key": config.decentApiKey,
              },
            }
          );

          const items: AllowlistItem[] = data.map(
            (e: { address: string; maxQuantity: number; pricePerToken: string }) => ({
              address: e.address,
              maxMints: String(e.maxQuantity),
              price: parseEther(String(e.pricePerToken)).toString() ?? editionConfig.tokenPrice,
              actualPrice:
                parseEther(String(e.pricePerToken)).toString() ?? editionConfig.tokenPrice,
            })
          );

          if (generateMerkleTree(items).tree.getHexRoot() === editionConfig.presaleMerkleRoot) {
            await createAllowlist(editionConfig.presaleMerkleRoot, items);
          } else {
            allowlistCreated = false;
          }
        }

        if (allowlistCreated) {
          results.push({
            collection,
            contract: collection,
            stage: `presale`,
            kind: "allowlist",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: collection,
                data: {
                  // `mintPresale`
                  signature: "0x727a612e",
                  params: [
                    {
                      kind: "quantity",
                      abiType: "uint256",
                    },
                    {
                      kind: "allowlist",
                      abiType: "uint256",
                    },
                    {
                      kind: "allowlist",
                      abiType: "uint256",
                    },
                    {
                      kind: "allowlist",
                      abiType: "bytes32[]",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Eth[config.chainId],
            allowlistId: editionConfig.presaleMerkleRoot,
            price: editionConfig.tokenPrice,
            maxSupply: editionConfig.maxTokens,
            startTime:
              editionConfig.presaleStart != "0"
                ? toSafeTimestamp(editionConfig.presaleStart)
                : undefined,
            endTime:
              editionConfig.presaleEnd != "0"
                ? toSafeTimestamp(editionConfig.presaleEnd)
                : undefined,
          });
        }
      } catch {
        logger.error(
          "mint-detector",
          JSON.stringify({ kind: STANDARD, error: "fetch allowlist failed" })
        );
        // fetch allowlist failed
      }
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  try {
    await Promise.all(
      results.map(async (cm) => {
        cm.status = await getStatus(cm);
      })
    );
  } catch {
    // Skip errors
  }
  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0x40c10f19", // `mint`
      "0x727a612e", // `mintPresale`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollection(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { collection } of existingCollectionMints.filter((cm) => cm.tokenId)) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection);
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

type ProofValue = string[];

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const items = await getAllowlist(collectionMint.allowlistId!);
  const { tree } = generateMerkleTree(items);
  const item = items.find((i) => i.address === address)!;
  const itemProof = tree.getHexProof(hashFn(item));
  return itemProof;
};
