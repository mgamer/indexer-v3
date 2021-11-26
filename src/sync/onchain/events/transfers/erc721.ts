import { Interface, LogDescription } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  TransferEvent,
  addTransferEvents,
  removeTransferEvents,
} from "@/events/common/transfers";
import { EventInfo } from "@/events/index";
import { parseEvent } from "@/events/parser";
import { MakerInfo, addToOrdersUpdateByMakerQueue } from "@/jobs/orders-update";

const abi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 indexed tokenId
  )`,
]);

// Old contracts might use a non-standard `Transfer` event
// which doesn't have the `tokenId` field indexed
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
    const transferEvents: TransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

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

        transferEvents.push({
          tokenId,
          from,
          to,
          amount,
          baseParams,
        });

        makerInfos.push({
          side: "sell",
          maker: from,
          contract: baseParams.address,
          tokenId,
        });
        makerInfos.push({
          side: "sell",
          maker: to,
          contract: baseParams.address,
          tokenId,
        });
      } catch (error) {
        logger.error(
          "erc721_transfer_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addTransferEvents("erc721", transferEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeTransferEvents(blockHash);
  },
});
