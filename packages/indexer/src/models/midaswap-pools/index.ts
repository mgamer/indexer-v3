import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum MidaswapPoolKind {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export type MidaswapPool = {
  address: string;
  // lpTokenAddress: string;
  nft: string;
  token: string;
  freeRate: string;
  // bondingCurve: string;
  // poolKind: MidaswapPoolKind;
  // pairKind: number;
  // propertyChecker: string;
  // tokenId?: string;
};

export const saveMidaswapPool = async (midaswapPool: MidaswapPool) => {
  await idb.none(
    `
      INSERT INTO midaswap_pools (
        address,
        nft,
        token,
        free_rate
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/freeRate/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(midaswapPool.address),
      nft: toBuffer(midaswapPool.nft),
      token: toBuffer(midaswapPool.token),
      freeRate: toBuffer(midaswapPool.freeRate),
      // bondingCurve: toBuffer(midaswapPool.bondingCurve),
      // poolKind: midaswapPool.poolKind,
      // pairKind: midaswapPool.pairKind,
      // propertyChecker: toBuffer(midaswapPool.propertyChecker),
      // tokenId: midaswapPool.tokenId,
    }
  );

  return midaswapPool;
};

export const getMidaswapPool = async (address: string): Promise<MidaswapPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        midaswap_pools.address,
        midaswap_pools.nft,
        midaswap_pools.token,
        midaswap_pools.free_rate
      FROM midaswap_pools
      WHERE midaswap_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    freeRate: fromBuffer(result.free_rate),
    // bondingCurve: fromBuffer(result.bonding_curve),
    // poolKind: result.pool_kind,
    // pairKind: result.pair_kind,
    // propertyChecker: fromBuffer(result.property_checker),
    // tokenId: result.token_id,
  };
};
