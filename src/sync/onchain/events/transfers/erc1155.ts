import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { batchQueries, db } from "@common/db";
import { logger } from "@common/logger";
import { baseProvider } from "@common/provider";
import { EventInfo } from "@events/index";
import { parseEvent } from "@events/parser";

const abi = new Interface([
  `event TransferSingle(
    address indexed operator,
    address indexed from,
    address indexed to,
    uint256 tokenId,
    uint256 amount
  )`,
  `event TransferBatch(
    address indexed operator,
    address indexed from,
    address indexed to,
    uint256[] tokenIds,
    uint256[] amounts
  )`,
]);

export const getTransferSingleEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("TransferSingle"), null, null, null],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const queries: any[] = [];
    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const from = parsedLog.args.from.toLowerCase();
        const to = parsedLog.args.to.toLowerCase();
        const tokenId = parsedLog.args.tokenId.toString();
        const amount = parsedLog.args.amount.toString();

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
            kind: "erc1155",
            tokenId,
            from,
            to,
            amount,
            ...baseParams,
          },
        });
      } catch (error) {
        logger.error(
          "erc1155_transfer_single_callback",
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

export const getTransferBatchEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("TransferBatch"), null, null, null],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const queries: any[] = [];
    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const from = parsedLog.args.from.toLowerCase();
        const to = parsedLog.args.to.toLowerCase();
        const tokenIds = parsedLog.args.tokenIds;
        const amounts = parsedLog.args.amounts;

        for (let i = 0; i < Math.min(tokenIds.length, amounts.length); i++) {
          const tokenId = tokenIds[i].toString();
          const amount = amounts[i].toString();

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
              kind: "erc1155",
              tokenId,
              from,
              to,
              amount,
              ...baseParams,
            },
          });
        }
      } catch (error) {
        logger.error(
          "erc1155_transfer_batch_callback",
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
