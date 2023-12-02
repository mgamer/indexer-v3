import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type DittoPool = {
  address: string;
  template: string;
  lpNft: string;
  permitter: string;
};

export const saveDittoPool = async (dittoPool: DittoPool) => {
  await idb.none(
    `
      INSERT INTO ditto_pools (
        address,
        template,
        lp_nft,
        permitter
      ) VALUES (
        $/address/,
        $/template/,
        $/lp_nft/,
        $/permitter/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(dittoPool.address),
      template: toBuffer(dittoPool.template),
      lp_nft: toBuffer(dittoPool.lpNft),
      permitter: toBuffer(dittoPool.permitter),
    }
  );
  return dittoPool;
};

export const getDittoPool = async (address: string): Promise<DittoPool | null> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        ditto_pools.address,
        ditto_pools.template,
        ditto_pools.lp_nft,
        ditto_pools.permitter
      FROM ditto_pools
      WHERE ditto_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  if (!result) return null;

  return {
    address,
    template: fromBuffer(result.template),
    lpNft: fromBuffer(result.lpNft),
    permitter: fromBuffer(result.permitter),
  };
};
