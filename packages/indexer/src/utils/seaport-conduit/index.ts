import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export const getConduits = async (
  conduitKeys: string[]
): Promise<
  {
    conduitKey: string;
    conduit: string;
    channels: string[];
  }[]
> => {
  const results = await redb.many(
    ` SELECT 
        conduit_key,
        conduit,
        channels
      FROM seaport_conduits
      WHERE seaport_conduits.conduit_key IN ($/keyIds:list/)
    `,
    { keyIds: conduitKeys.map((c) => toBuffer(c)) }
  );
  return results.map((c) => {
    return {
      conduitKey: fromBuffer(c.conduit_key),
      conduit: fromBuffer(c.conduit),
      channels: c.channels,
    };
  });
};

export const checkChannelIsOpen = async (conduitKey: string, channel: string): Promise<boolean> => {
  const results = await getConduits([conduitKey]);
  if (!results.length) return false;
  return results[0].channels.includes(channel);
};

export const saveConduit = async (conduit: string, conduitKey: string, txHash: string) => {
  await idb.none(
    `
      INSERT INTO seaport_conduits (
        conduit,
        conduit_key,
        tx_hash,
        channels
      ) VALUES (
        $/conduit/,
        $/conduitKey/,
        $/txHash/,
        $/channels/
      ) ON CONFLICT DO NOTHING
    `,
    {
      conduit: toBuffer(conduit),
      conduitKey: toBuffer(conduitKey),
      txHash: toBuffer(txHash),
      channels: "[]",
    }
  );
};

export const updateConduitChannels = async (conduit: string, channel: string, open: boolean) => {
  const conduitState = await redb.oneOrNone(
    `
      SELECT channels, conduit 
      FROM seaport_conduits 
      WHERE seaport_conduits.conduit = $/conduit/
    `,
    {
      conduit: toBuffer(conduit),
    }
  );

  if (!conduitState) {
    throw new Error("conduit not exists");
  }

  const isExist = conduitState.channels.includes(channel);
  let newChannels: string[] = [];
  if (!open) {
    newChannels = conduitState.channels.filter((c: string) => c != channel);
  } else if (!isExist) {
    newChannels = conduitState.channels.concat([channel]);
  }

  await idb.none(
    `
      UPDATE seaport_conduits
        SET channels = $/channelList:json/
      WHERE seaport_conduits.conduit = $/conduit/
    `,
    {
      conduit: toBuffer(conduit),
      channelList: newChannels,
    }
  );
  return newChannels;
};
