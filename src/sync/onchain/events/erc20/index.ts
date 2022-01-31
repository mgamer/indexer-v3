import { AddressZero } from "@ethersproject/constants";
import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import {
  FtTransferEvent,
  addFtTransferEvents,
  removeFtTransferEvents,
} from "@/events/common/ft-transfers";
import { ContractInfo } from "@/events/index";
import { parseEvent } from "@/events/parser";
import { MakerInfo, addToOrdersUpdateByMakerQueue } from "@/jobs/orders-update";

const abi = new Interface([
  `event Transfer(
    address indexed from,
    address indexed to,
    uint256 amount
  )`,
  `event Deposit(
    address indexed to,
    uint256 amount
  )`,
  `event Withdrawal(
    address indexed from,
    uint256 amount
  )`,
]);

export const getContractInfo = (address: string[] = []): ContractInfo => ({
  filter: { address },
  syncCallback: async (logs: Log[], backfill?: boolean) => {
    const transferEvents: FtTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);
        const context =
          baseParams.txHash + "-" + baseParams.logIndex.toString();

        switch (log.topics[0]) {
          case abi.getEventTopic("Transfer"): {
            const parsedLog = abi.parseLog(log);
            const from = parsedLog.args.from.toLowerCase();
            const to = parsedLog.args.to.toLowerCase();
            const amount = parsedLog.args.amount.toString();

            transferEvents.push({
              from,
              to,
              amount,
              baseParams,
            });

            makerInfos.push({
              context,
              side: "buy",
              maker: from,
              contract: baseParams.address,
            });
            makerInfos.push({
              context,
              side: "buy",
              maker: to,
              contract: baseParams.address,
            });

            break;
          }

          case abi.getEventTopic("Deposit"): {
            const parsedLog = abi.parseLog(log);
            const from = AddressZero;
            const to = parsedLog.args.to.toLowerCase();
            const amount = parsedLog.args.amount.toString();

            transferEvents.push({
              from,
              to,
              amount,
              baseParams,
            });

            makerInfos.push({
              context,
              side: "buy",
              maker: to,
              contract: baseParams.address,
            });

            break;
          }

          case abi.getEventTopic("Withdrawal"): {
            const parsedLog = abi.parseLog(log);
            const from = parsedLog.args.from.toLowerCase();
            const to = AddressZero;
            const amount = parsedLog.args.amount.toString();

            transferEvents.push({
              from,
              to,
              amount,
              baseParams,
            });

            makerInfos.push({
              context,
              side: "buy",
              maker: from,
              contract: baseParams.address,
            });

            break;
          }
        }
      } catch (error) {
        logger.error("erc20_callback", `Could not parse log ${log}: ${error}`);
      }
    }

    await addFtTransferEvents(transferEvents);
    if (!backfill && config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeFtTransferEvents(blockHash);
  },
});
