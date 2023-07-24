import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type MidaswapPool = {
  address: string;
  nft: string;
  token: string;
  freeRate: string;
  royalty: string;
};

export const saveMidaswapPool = async (midaswapPool: MidaswapPool) => {
  await idb.none(
    `
      INSERT INTO midaswap_pools (
        address,
        nft,
        token,
        free_rate_bps,
        royalty_bps
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/freeRate/,
        $/royalty/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(midaswapPool.address),
      nft: toBuffer(midaswapPool.nft),
      token: toBuffer(midaswapPool.token),
      freeRate: toBuffer(midaswapPool.freeRate),
      royalty: toBuffer(midaswapPool.royalty),
    }
  );

  return midaswapPool;
};

export const getMidaswapPool = async (address: string) => {
  const result = await idb.oneOrNone(
    `
      SELECT
        midaswap_pools.address,
        midaswap_pools.nft,
        midaswap_pools.token,
        midaswap_pools.free_rate_bps,
        midaswap_pools.royalty_bps
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
    royalty: fromBuffer(result.royalty),
  };
};
