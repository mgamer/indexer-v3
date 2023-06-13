import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export const getConduits = async (
  conduitKeys: string[]
): Promise<
  {
    conduitKey: string;
    conduit: string;
    enabled: boolean;
  }[]
> => {
  const results = await redb.many(
    ` SELECT 
        conduit_key,
        conduit,
        enabled
      FROM seaport_conduits
      WHERE seaport_conduits.conduit_key IN ($/keyIds:list/)
    `,
    { keyIds: conduitKeys.map((c) => toBuffer(c)) }
  );
  return results.map((c) => {
    return {
      conduitKey: fromBuffer(c.conduit_key),
      conduit: fromBuffer(c.conduit),
      enabled: c.enabled,
    };
  });
};

export const saveConduit = async (conduit: string, conduitKey: string, txHash: string) => {
  await idb.none(
    `
      INSERT INTO seaport_conduits (
        conduit,
        conduit_key,
        tx_hash,
        enabled
      ) VALUES (
        $/conduit/,
        $/conduitKey/,
        $/txHash/,
        $/enabled/
      ) ON CONFLICT DO NOTHING
    `,
    {
      conduit: toBuffer(conduit),
      conduitKey: toBuffer(conduitKey),
      txHash: toBuffer(txHash),
      enabled: true,
    }
  );
};
