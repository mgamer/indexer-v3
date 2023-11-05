import { ParamType } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { idb } from "@/common/db";
import { AddressZero } from "@ethersproject/constants";
import * as utils from "@/events-sync/utils";
import { logger } from "@/common/logger";
import { bn, toBuffer, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { AbiParam } from "@/orderbook/mints/calldata";
import { getMaxSupply } from "@/orderbook/mints/calldata/helpers";
import { getMethodSignature, MethodSignature } from "@/orderbook/mints/method-signatures";

const STANDARD = "unknown";

const isEmptyOrZero = (array: string[], emptyValue: string) =>
  !array.length || array.every((i) => i === emptyValue);

const checkIsComplexParam = (abiType: string) => {
  // Support complex types as long as they're empty or contain "zero" values
  const complexKeywords = ["(", ")", "[", "]", "bytes", "tuple"];
  return complexKeywords.some((c) => abiType.includes(c));
};

export async function getSampleTxs(collection: string) {
  const mintTxHashs = await idb
    .manyOrNone(
      `
        SELECT
          DISTINCT(nft_transfer_events.tx_hash) as tx_hash
        FROM nft_transfer_events
        WHERE 
          nft_transfer_events.address = $/contract/
          AND nft_transfer_events.from = $/from/
        LIMIT 15
      `,
      {
        contract: toBuffer(collection),
        from: toBuffer(AddressZero),
      }
    )
    .then((ts) =>
      ts.map((t) => ({
        txHash: fromBuffer(t.tx_hash),
      }))
    );
  const mintTxs: Transaction[] = await Promise.all(
    mintTxHashs.map((c) => utils.fetchTransaction(c.txHash))
  );
  return mintTxs;
}

export async function getConstantParamsWithSampleTxs(
  methodSignature: MethodSignature,
  sampleTxs: Transaction[]
) {
  // Guess possible constant params by statistics from multiple mint transactions
  const constantParams: number[] = [];

  const parsedMethodSignaturies: MethodSignature[] = [];
  const valueStats: Map<string, number> = new Map();
  for (const sampleTx of sampleTxs) {
    const parsedMethodSignature = await getMethodSignature(sampleTx.data);
    if (parsedMethodSignature && parsedMethodSignature.signature === methodSignature.signature) {
      parsedMethodSignaturies.push(parsedMethodSignature);
    }
  }

  // Sample data too small
  if (parsedMethodSignaturies.length < 2) {
    return constantParams;
  }

  for (const parsedMethodSignature of parsedMethodSignaturies) {
    parsedMethodSignature.inputs.forEach((abi, i) => {
      const decodedValue = parsedMethodSignature.decodedCalldata[i];
      const strValue = decodedValue.toString();
      const statKey = `param:${i}:${strValue}`;
      const count = valueStats.get(statKey);
      if (count != null) {
        valueStats.set(statKey, count + 1);
      } else {
        valueStats.set(statKey, 1);
      }
    });
  }

  const totalSamples = sampleTxs.length;
  const statPercentThreshold = 80;

  methodSignature.inputs.forEach((abi, i) => {
    const abiType = abi.type!;
    const isComplexParam = checkIsComplexParam(abiType);
    const decodedValue = methodSignature.decodedCalldata[i];
    const strValue = decodedValue.toString();
    if (isComplexParam) {
      const statKey = `param:${i}:${strValue}`;
      const statCount = valueStats.get(statKey);
      if (statCount) {
        const percent = (statCount * 100) / totalSamples;
        if (percent > statPercentThreshold) {
          constantParams.push(i);
        }
      }
    }
  });

  return constantParams;
}

export const extractByTx = async (
  collection: string,
  tx: Transaction,
  pricePerAmountMinted: BigNumber,
  amountMinted: BigNumber,
  sampleTxs?: Transaction[]
): Promise<CollectionMint[]> => {
  const maxSupply = await getMaxSupply(collection);

  if (tx.data.length === 10) {
    return [
      {
        collection,
        contract: collection,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: "unknown",
        details: {
          tx: {
            to: tx.to,
            data: {
              signature: tx.data,
              params: [],
            },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price: pricePerAmountMinted.toString(),
        maxSupply,
      },
    ];
  }

  // Try to get the method signature from the calldata
  const methodSignature = await getMethodSignature(tx.data);
  if (!methodSignature) {
    return [];
  }

  const parsedParams = methodSignature.inputs.map((c) => c.type!);
  const hasComplexParams = parsedParams.some((abiType) => checkIsComplexParam(abiType));

  let emptyOrZero = false;
  let possibleConstantParams: number[] = [];

  if (hasComplexParams) {
    parsedParams.forEach((abiType, i) => {
      const decodedValue = methodSignature.decodedCalldata[i];

      const isComplexParam = checkIsComplexParam(abiType);
      if (isComplexParam && abiType.includes("tuple")) {
        const subParams = methodSignature.inputs[i].components!;

        emptyOrZero = subParams.every((param, i) => {
          const value = decodedValue[i];
          if (param.type === "bytes32") {
            return value === HashZero;
          } else if (param.type === "bytes32[]") {
            return isEmptyOrZero(value, HashZero);
          }
          return false;
        });
      } else if (abiType.includes("bytes32[]")) {
        emptyOrZero = isEmptyOrZero(decodedValue, HashZero);
      }
    });

    if (!emptyOrZero) {
      const sampleMintTxs = sampleTxs ? sampleTxs : await getSampleTxs(collection);
      if (sampleMintTxs.length) {
        possibleConstantParams = await getConstantParamsWithSampleTxs(
          methodSignature,
          sampleMintTxs
        );
      }
    }

    if (!emptyOrZero && possibleConstantParams.length === 0) {
      return [];
    }
  }

  const params: AbiParam[] = [];

  try {
    if (methodSignature.params.length) {
      parsedParams.forEach((abiType, i) => {
        const decodedValue = methodSignature.decodedCalldata[i];
        const isComplexParam = checkIsComplexParam(abiType);
        const isConstantParam = possibleConstantParams.some((c) => c == i);

        if (isConstantParam) {
          params.push({
            kind: "unknown",
            abiType: ParamType.fromObject(methodSignature.inputs[i]).format(),
            abiValue: decodedValue,
          });
        } else if (
          abiType.includes("int") &&
          (isComplexParam
            ? decodedValue.length === 1 && bn(decodedValue[0]).eq(amountMinted)
            : bn(decodedValue).eq(amountMinted))
        ) {
          params.push({
            kind: "quantity",
            abiType,
          });
        } else if (
          abiType.includes("address") &&
          (isComplexParam
            ? decodedValue.length === 1 && decodedValue[0].toLowerCase() === collection
            : decodedValue.toLowerCase() === collection)
        ) {
          params.push({
            kind: "contract",
            abiType,
          });
        } else if (
          abiType.includes("address") &&
          (isComplexParam
            ? decodedValue.length === 1 && decodedValue[0].toLowerCase() === tx.from
            : decodedValue.toLowerCase() === tx.from)
        ) {
          params.push({
            kind: "recipient",
            abiType,
          });
        } else if (abiType.includes("tuple") || abiType.includes("[]")) {
          params.push({
            kind: "unknown",
            abiType: ParamType.fromObject(methodSignature.inputs[i]).format(),
            abiValue: decodedValue,
          });
        } else {
          params.push({
            kind: "unknown",
            abiType,
            abiValue: decodedValue.toString().toLowerCase(),
          });
        }
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  if (params.length != parsedParams.length) {
    return [];
  }

  const collectionMint: CollectionMint = {
    collection,
    contract: collection,
    stage: "public-sale",
    kind: "public",
    status: "open",
    standard: STANDARD,
    details: {
      tx: {
        to: tx.to,
        data: {
          signature: methodSignature.signature,
          params,
        },
      },
    },
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: pricePerAmountMinted.toString(),
    maxSupply,
  };

  const results = [collectionMint];

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
