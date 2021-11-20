import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "../../../../common/logger";
import { EventInfo } from "../../events";
import { parseEvent } from "../parser";
import { Transfer, addTransfers, removeTransfers } from "./common";

const abi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 indexed tokenId
  )`,
]);

export const getTransferEventInfo = (contracts: string[] = []): EventInfo => ({
  filter: {
    topics: [abi.getEventTopic("Transfer"), null, null, null],
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
        const amount = "1";

        transfers.push({
          tokenId,
          from,
          to,
          amount,
          baseParams,
        });
      } catch (error) {
        logger.error(
          "erc721_transfer_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addTransfers(transfers, "erc721");
  },
  fixCallback: async (blockHash) => {
    await removeTransfers(blockHash);
  },
});
