import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "../../../../common/logger";
import { EventInfo } from "../../events";
import { parseEvent } from "../parser";
import { Transfer, addTransfers, removeTransfers } from "./common";

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
  filter: {
    topics: [abi.getEventTopic("TransferSingle"), null, null, null],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const transfers: Transfer[] = [];
    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const from = parsedLog.args.from.toLowerCase();
        const to = parsedLog.args.to.toLowerCase();
        const tokenId = parsedLog.args.tokenId.toString();
        const amount = parsedLog.args.amount.toString();

        transfers.push({
          tokenId,
          from,
          to,
          amount,
          baseParams,
        });
      } catch (error) {
        logger.error(
          "erc1155_transfer_single_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addTransfers(transfers, "erc1155");
  },
  fixCallback: async (blockHash) => {
    await removeTransfers(blockHash);
  },
});

export const getTransferBatchEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  filter: {
    topics: [abi.getEventTopic("TransferBatch"), null, null, null],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const transfers: Transfer[] = [];
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

          transfers.push({
            tokenId,
            from,
            to,
            amount,
            baseParams,
          });
        }
      } catch (error) {
        logger.error(
          "erc1155_transfer_batch_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addTransfers(transfers, "erc1155");
  },
  fixCallback: async (blockHash) => {
    await removeTransfers(blockHash);
  },
});
