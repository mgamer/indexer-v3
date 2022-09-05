import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type SudoswapPool = {
  poolContract: string;
  nftContract: string;
  tokenContract: string;
  bondingCurveContract: string;
  poolKind: number;
  pairKind: number;
};

export const saveSudoswapPool = async (sudoswapPool: SudoswapPool) => {
  await idb.none(
    `
      INSERT INTO sudoswap_pools (
        pool_contract,
        nft_contract,
        token_contract,
        bonding_curve_contract,
        pool_kind,
        pair_kind
      ) VALUES (
        $/poolContract/,
        $/nftContract/,
        $/tokenContract/,
        $/bondingCurveContract/,
        $/poolKind/,
        $/pairKind/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      poolContract: toBuffer(sudoswapPool.poolContract),
      nftContract: toBuffer(sudoswapPool.nftContract),
      tokenContract: toBuffer(sudoswapPool.tokenContract),
      bondingCurveContract: toBuffer(sudoswapPool.bondingCurveContract),
      poolKind: sudoswapPool.poolKind,
      pairKind: sudoswapPool.pairKind,
    }
  );

  return sudoswapPool;
};

export const getSudoswapPool = async (poolContract: string): Promise<SudoswapPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        sudoswap_pools.pool_contract,
        sudoswap_pools.nft_contract,
        sudoswap_pools.token_contract,
        sudoswap_pools.bonding_curve_contract,
        sudoswap_pools.pool_kind,
        sudoswap_pools.pair_kind
      FROM sudoswap_pools
      WHERE sudoswap_pools.pool_contract = $/poolContract/
    `,
    { poolContract: toBuffer(poolContract) }
  );

  return {
    poolContract,
    nftContract: fromBuffer(result.nft_contract),
    tokenContract: fromBuffer(result.token_contract),
    bondingCurveContract: fromBuffer(result.bonding_curve_contract),
    poolKind: result.pool_kind,
    pairKind: result.pair_kind,
  };
};
