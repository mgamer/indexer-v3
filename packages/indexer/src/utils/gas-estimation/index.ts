import { idb, redb, pgp } from "@/common/db";
import { keccak256 } from "@ethersproject/solidity";
import { redis } from "@/common/redis";
import { baseProvider } from "@/common/provider";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import { bn } from "@/common/utils";
import { logger } from "@/common/logger";
import { estimateGasJob } from "@/jobs/gas-estimation/estimate-gas-job";

export type GasEstimation = {
  tagId: string;
  tags: string[];
  gas: string;
  gasPrice: string;
  gasValue: string;
  createdAt?: string;
};

export type GasEstimationTranscation = {
  txData: TxData;
  txTags: string[];
};

export async function saveGasEstimations(estimations: GasEstimation[]) {
  const columns = new pgp.helpers.ColumnSet(
    ["tag_id", { name: "tags", mod: ":json" }, "gas", "gas_price", "gas_value"],
    {
      table: "gas_estimations",
    }
  );

  await idb.none(
    pgp.helpers.insert(
      estimations.map((_) => {
        return {
          tag_id: _.tagId,
          tags: _.tags,
          gas: _.gas,
          gas_price: _.gasPrice,
          gas_value: _.gasValue,
        };
      }),
      columns
    ) + " ON CONFLICT DO NOTHING"
  );
}

export function getTagId(txTags: string[]) {
  return keccak256(["string"], [txTags.join("-")]);
}

export async function getGasEstimations(
  tags: string[],
  type: "tagId" | "tags"
): Promise<GasEstimation[]> {
  const results =
    type === "tagId"
      ? await redb.manyOrNone(
          `
        SELECT gas_estimations.* 
        FROM gas_estimations
        WHERE gas_estimations.tag_id = $/tagId/ 
        ORDER BY created_at DESC
        LIMIT 10
        `,
          {
            tagId: tags[0],
          }
        )
      : await redb.manyOrNone(
          `
        SELECT gas_estimations.* 
        FROM gas_estimations
        WHERE gas_estimations.tags ? $/tag_one/ AND gas_estimations.tags ? $/tag_two/
        ORDER BY created_at DESC
        LIMIT 10
        `,
          {
            tag_one: tags[0],
            tag_two: tags[1],
          }
        );
  return results.map((c) => {
    return {
      tagId: c.tag_id,
      tags: c.tags,
      gas: c.gas,
      gasPrice: c.gas_price,
      gasValue: c.gas_value,
      createdAt: c.created_at,
    };
  });
}

export async function lookupEstimation(
  txTags: string[]
): Promise<GasEstimation | null | undefined> {
  const tagId = getTagId(txTags);
  let result: GasEstimation | null | undefined;
  const cacheKey = `gas-estimation:${tagId}`;
  result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as GasEstimation) : null));
  if (!result) {
    result = await lookupEstimationFromDB(txTags);
    await redis.set(cacheKey, JSON.stringify(result), "EX", 100);
  }
  return result;
}

export async function lookupEstimationFromDB(txTags: string[]) {
  const tagId = getTagId(txTags);
  let estimations = await getGasEstimations([tagId], "tagId");

  // Fallback to by tags
  if (!estimations.length) {
    estimations = await getGasEstimations(txTags, "tags");
  }

  return estimations[0];
}

export async function getFeeDataWithCache() {
  let result: string | null;
  const cacheKey = `feedata_v1`;
  result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string) : null));
  if (!result) {
    const rawData = await baseProvider.getFeeData();
    result = rawData.maxFeePerGas!.toString();
    await redis.set(cacheKey, JSON.stringify(result), "EX", 60);
  }
  return result;
}

export async function doGasEstimate(txData: TxData, txTags: string[]) {
  const txTagId = getTagId(txTags);
  //   const feeData = await baseProvider.getFeeData();
  const maxFeePerGas = await getFeeDataWithCache();
  const functionGasFees = await baseProvider.estimateGas(txData);
  const gasData: GasEstimation = {
    // id: keccak256(["string"], [`${txTagId}-${randomUUID()}`]),
    tagId: keccak256(["string"], [txTagId]),
    tags: txTags,
    gas: functionGasFees.toString(),
    gasPrice: maxFeePerGas,
    gasValue: functionGasFees.mul(bn(maxFeePerGas!)).toString(),
  };
  return gasData;
}

export async function getTotalEstimateGas(transcations: GasEstimationTranscation[]) {
  const result = await Promise.all(
    transcations.map(({ txTags }) => {
      return lookupEstimationFromDB(txTags);
    })
  );

  const missingTranscations: GasEstimationTranscation[] = [];
  const totalGas = result.reduce((total, item, index) => {
    if (item) {
      return total.add(item.gas);
    } else {
      missingTranscations.push(transcations[index]);
      return total;
    }
  }, bn(0));

  try {
    await estimateGasJob.addToQueue([missingTranscations]);
  } catch {
    // Skip errors
  }
  return {
    totalEstimateGas: totalGas.toString(),
    missingTranscations,
  };
}

export async function processGasEstimation(transcations: GasEstimationTranscation[]) {
  try {
    const result = await Promise.all(
      transcations.map(({ txData, txTags }) => {
        return doGasEstimate(txData, txTags);
      })
    );

    await saveGasEstimations(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error("estimate-gas", `processGasEstimation error. error=${error.message}`);
    return null;
  }
}
