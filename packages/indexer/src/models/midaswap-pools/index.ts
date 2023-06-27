import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum MidaswapPoolKind {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export type MidaswapPool = {
  address: string;
  nft: string;
  token: string;
  bondingCurve: string;
  poolKind: MidaswapPoolKind;
  pairKind: number;
  propertyChecker: string;
  tokenId?: string;
};

export const saveMidaswapPool = async (midaswapPool: MidaswapPool) => {
  await idb.none(
    `
      INSERT INTO midaswap_pools (
        address,
        nft,
        token,
        bonding_curve,
        pool_kind,
        pair_kind,
        property_checker,
        token_id
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/bondingCurve/,
        $/poolKind/,
        $/pairKind/,
        $/propertyChecker/,
        $/tokenId/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(midaswapPool.address),
      nft: toBuffer(midaswapPool.nft),
      token: toBuffer(midaswapPool.token),
      bondingCurve: toBuffer(midaswapPool.bondingCurve),
      poolKind: midaswapPool.poolKind,
      pairKind: midaswapPool.pairKind,
      propertyChecker: toBuffer(midaswapPool.propertyChecker),
      tokenId: midaswapPool.tokenId,
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
        midaswap_pools.bonding_curve,
        midaswap_pools.pool_kind,
        midaswap_pools.pair_kind,
        midaswap_pools.property_checker,
        midaswap_pools.token_id
      FROM midaswap_pools
      WHERE midaswap_pools.address = $/address/
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
    propertyChecker: fromBuffer(result.property_checker),
    tokenId: result.token_id,
  };
};
