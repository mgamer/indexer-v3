import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum SudoswapV2PoolKind {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export type SudoswapV2Pool = {
  address: string;
  nft: string;
  token: string;
  bondingCurve: string;
  poolKind: SudoswapV2PoolKind;
  pairKind: number;
  tokenId: string | null;
};

export const saveSudoswapV2Pool = async (sudoswapPool: SudoswapV2Pool) => {
  await idb.none(
    `
      INSERT INTO sudoswap_v2_pools (
        address,
        nft,
        token,
        bonding_curve,
        pool_kind,
        pair_kind,
        token_id,
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/bondingCurve/,
        $/poolKind/,
        $/pairKind/,
        $/tokenId/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(sudoswapPool.address),
      nft: toBuffer(sudoswapPool.nft),
      token: toBuffer(sudoswapPool.token),
      bondingCurve: toBuffer(sudoswapPool.bondingCurve),
      poolKind: sudoswapPool.poolKind,
      pairKind: sudoswapPool.pairKind,
      tokenId: sudoswapPool.tokenId,
    }
  );

  return sudoswapPool;
};

export const getSudoswapV2Pool = async (address: string): Promise<SudoswapV2Pool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        sudoswap_v2_pools.address,
        sudoswap_v2_pools.nft,
        sudoswap_v2_pools.token,
        sudoswap_v2_pools.bonding_curve,
        sudoswap_v2_pools.pool_kind,
        sudoswap_v2_pools.pair_kind,
        sudoswap_v2_pools.token_id
      FROM sudoswap_v2_pools
      WHERE sudoswap_v2_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    bondingCurve: fromBuffer(result.bonding_curve),
    poolKind: result.pool_kind,
    pairKind: result.pair_kind,
    tokenId: result.token_id,
  };
};
