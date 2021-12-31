import { Interface, LogDescription } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  NftTransferEvent,
  addNftTransferEvents,
  removeNftTransferEvents,
} from "@/events/common/nft-transfers";
import { ContractInfo } from "@/events/index";
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
// which doesn't have the `tokenId` field indexed. Since it
// has the same name as the standard event, we cannot plug
// it in the same interface due to conflicts.
const nonStandardAbi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 tokenId
  )`,
]);

export const getContractInfo = (address: string[] = []): ContractInfo => ({
  provider: baseProvider,
  filter: { address },
  syncCallback: async (logs: Log[]) => {
    const transferEvents: NftTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        switch (log.topics[0]) {
          case abi.getEventTopic("Transfer"): {
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
              txHash: baseParams.txHash,
              side: "sell",
              maker: from,
              contract: baseParams.address,
              tokenId,
            });
            makerInfos.push({
              txHash: baseParams.txHash,
              side: "sell",
              maker: to,
              contract: baseParams.address,
              tokenId,
            });

            break;
          }
        }
      } catch (error) {
        logger.error("erc721_callback", `Could not parse log ${log}: ${error}`);
      }
    }

    await addNftTransferEvents("erc721", transferEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeNftTransferEvents(blockHash);
  },
});
