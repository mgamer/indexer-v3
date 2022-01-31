import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
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

export const getContractInfo = (address: string[] = []): ContractInfo => ({
  filter: { address },
  syncCallback: async (logs: Log[], backfill?: boolean) => {
    const transferEvents: NftTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);
        const context =
          baseParams.txHash + "-" + baseParams.logIndex.toString();

        switch (log.topics[0]) {
          case abi.getEventTopic("TransferSingle"): {
            const parsedLog = abi.parseLog(log);
            const from = parsedLog.args.from.toLowerCase();
            const to = parsedLog.args.to.toLowerCase();
            const tokenId = parsedLog.args.tokenId.toString();
            const amount = parsedLog.args.amount.toString();

            transferEvents.push({
              tokenId,
              from,
              to,
              amount,
              baseParams,
            });

            makerInfos.push({
              context,
              side: "sell",
              maker: from,
              contract: baseParams.address,
              tokenId,
            });
            makerInfos.push({
              context,
              side: "sell",
              maker: to,
              contract: baseParams.address,
              tokenId,
            });

            break;
          }

          case abi.getEventTopic("TransferBatch"): {
            const parsedLog = abi.parseLog(log);
            const from = parsedLog.args.from.toLowerCase();
            const to = parsedLog.args.to.toLowerCase();
            const tokenIds = parsedLog.args.tokenIds;
            const amounts = parsedLog.args.amounts;

            const numTransfers = Math.min(tokenIds.length, amounts.length);
            for (let i = 0; i < numTransfers; i++) {
              const tokenId = tokenIds[i].toString();
              const amount = amounts[i].toString();

              transferEvents.push({
                tokenId,
                from,
                to,
                amount,
                baseParams,
              });

              makerInfos.push({
                context,
                side: "sell",
                maker: from,
                contract: baseParams.address,
                tokenId,
              });
              makerInfos.push({
                context,
                side: "sell",
                maker: to,
                contract: baseParams.address,
                tokenId,
              });
            }

            break;
          }
        }
      } catch (error) {
        logger.error(
          "erc1155_callback",
          `Could not parse log ${log}: ${error}`
        );
      }
    }

    await addNftTransferEvents(transferEvents);
    if (!backfill && config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeNftTransferEvents(blockHash);
  },
});
