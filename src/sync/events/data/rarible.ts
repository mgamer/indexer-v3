import { Interface } from "@ethersproject/abi";
import { Rarible } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const match: EventData = {
  kind: "rarible-match",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x956cd63ee4cdcd81fda5f0ec7c6c36dceda99e1b412f4a650a5d26055dc3c450",
  numTopics: 1,
  abi: new Interface([
    `event Match(
      bytes32 leftHash,
      bytes32 rightHash,
      uint newLeftFill,
      uint newRightFill)
    `,
  ]),
};
