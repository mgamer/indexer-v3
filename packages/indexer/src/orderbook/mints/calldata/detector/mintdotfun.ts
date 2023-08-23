import { redis } from "@/common/redis";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import axios from "axios";
import { MethodSignature } from "@/orderbook/mints/method-signatures";

const STANDARD = "mintdotfun";

export const extractByCollectionMint = async (
  collectionMint: CollectionMint,
  methodSignature: MethodSignature
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const proofParamIndex = methodSignature.params
    .split(",")
    .findIndex((abiType) => abiType.includes("bytes32[]"));

  const proofValue = methodSignature.decodedCalldata[proofParamIndex];
  const { data } = await axios.get(`https://lanyard.org/api/v1/roots`, {
    params: {
      proof: proofValue.join(","),
    },
  });

  if (data.error) {
    return results;
  }

  const merkleRoot = data.roots[0];

  collectionMint.details.tx.data.params[proofParamIndex] = {
    kind: "allowlist",
    abiType: "bytes32[]",
  };

  collectionMint.standard = STANDARD;
  collectionMint.allowlistId = merkleRoot;
  collectionMint.stage = "presale";
  collectionMint.kind = "allowlist";

  results.push(collectionMint);

  return results;
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  // TODO: We should look into re-detecting and updating any fields that
  // could have changed on the mint since the initial detection
  for (const collectionMint of existingCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }
};

type ProofValue = string[];

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${collectionMint.tokenId}-${address}`;
  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(
        `https://lanyard.org/api/v1/proof?unhashedLeaf=${address}&root=${collectionMint.allowlistId}`
      )
      .then(({ data }) => data.proof);

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
    }
  }
  return result;
};
