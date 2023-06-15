import { idb, redb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";

export const getConduits = async (
  conduitKeys: string[]
): Promise<
  {
    conduitKey: string;
    channel: string;
  }[]
> => {
  const results = await redb.manyOrNone(
    ` SELECT 
        conduit_key,
        channel
      FROM seaport_conduit_open_channels
      WHERE seaport_conduit_open_channels.conduit_key IN ($/keyIds:list/)
    `,
    { keyIds: conduitKeys.map((c) => toBuffer(c)) }
  );
  return results.map((c) => {
    return {
      conduitKey: fromBuffer(c.conduit_key),
      channel: fromBuffer(c.channel),
    };
  });
};

export const updateConduitChannel = async (conduit: string) => {
  const iface = new Interface([
    "function getKey(address conduit) external view returns (bytes32 conduitKey)",
    "function getChannels(address conduit) external view returns (address[] channels)",
  ]);

  const conduitController = new Contract(
    Sdk.SeaportBase.Addresses.ConduitController[config.chainId],
    iface,
    baseProvider
  );

  const [conduitKeyRaw, channelsRaw] = await Promise.all([
    conduitController.getKey(conduit),
    conduitController.getChannels(conduit),
  ]);

  const conduitKey = conduitKeyRaw.toLowerCase();
  const channels = channelsRaw.map((c: string) => c.toLowerCase());

  const columns = new pgp.helpers.ColumnSet(["conduit_key", "channel"], {
    table: "seaport_conduit_open_channels",
  });

  const saveValues = channels.map((channel: string) => {
    return {
      channel: toBuffer(channel),
      conduit_key: toBuffer(conduitKey),
    };
  });

  const saveQuery = pgp.as.format(
    `
    WITH x AS (
      DELETE FROM seaport_conduit_open_channels WHERE conduit_key = $/conduitKey/
    )
    INSERT INTO seaport_conduit_open_channels (
      conduit_key,
      channel
    ) VALUES ${pgp.helpers.values(saveValues, columns)}
    ON CONFLICT DO NOTHING
  `,
    {
      conduitKey,
    }
  );

  await idb.none(saveQuery);
};
