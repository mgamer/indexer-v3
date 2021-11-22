import { Interface, LogDescription } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { batchQueries, db } from "@common/db";
import { logger } from "@common/logger";
import { baseProvider } from "@common/provider";
import { EventInfo } from "@events/index";
import { parseEvent } from "@events/parser";

const abi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 indexed tokenId
  )`,
]);

// Old contracts might use a non-standard Transfer event
// which doesn't have the tokenId field indexed
const nonStandardAbi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 tokenId
  )`,
]);

export const getTransferEventInfo = (contracts: string[] = []): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("Transfer")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const queries: any[] = [];
    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        let parsedLog: LogDescription;
        try {
          parsedLog = abi.parseLog(log);
        } catch {
          parsedLog = nonStandardAbi.parseLog(log);
        }
        const from = parsedLog.args.from.toLowerCase();
        const to = parsedLog.args.to.toLowerCase();
        const tokenId = parsedLog.args.tokenId.toString();
        const amount = "1";

        queries.push({
          query: `
            select add_transfer_event(
              $/kind/,
              $/tokenId/,
              $/from/,
              $/to/,
              $/amount/,
              $/address/,
              $/block/,
              $/blockHash/,
              $/txHash/,
              $/txIndex/,
              $/logIndex/
            )
          `,
          values: {
            kind: "erc721",
            tokenId,
            from,
            to,
            amount,
            ...baseParams,
          },
        });
      } catch (error) {
        logger.error(
          "erc721_transfer_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await batchQueries(queries);
  },
  fixCallback: async (blockHash) => {
    await db.none("select remove_transfer_events($/blockHash/)", { blockHash });
  },
});
