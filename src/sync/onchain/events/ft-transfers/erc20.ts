import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  FtTransferEvent,
  addFtTransferEvents,
  removeFtTransferEvents,
} from "@/events/common/ft-transfers";
import { EventInfo } from "@/events/index";
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

export const getTransferEventInfo = (contracts: string[] = []): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("Transfer")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const transferEvents: FtTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const tokenId = "-1";
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
          side: "buy",
          maker: from,
          contract: baseParams.address,
          tokenId,
        });
        makerInfos.push({
          side: "buy",
          maker: to,
          contract: baseParams.address,
          tokenId,
        });
      } catch (error) {
        logger.error("erc20_transfer_callback", `Invalid log ${log}: ${error}`);
      }
    }

    await addFtTransferEvents(transferEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeFtTransferEvents(blockHash);
  },
});

export const getDepositEventInfo = (contracts: string[] = []): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("Deposit")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const transferEvents: FtTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const tokenId = "-1";
        const from = "0x0000000000000000000000000000000000000000";
        const to = parsedLog.args.to.toLowerCase();
        const amount = parsedLog.args.amount.toString();

        transferEvents.push({
          from,
          to,
          amount,
          baseParams,
        });

        makerInfos.push({
          side: "buy",
          maker: to,
          contract: baseParams.address,
          tokenId,
        });
      } catch (error) {
        logger.error("erc20_deposit_callback", `Invalid log ${log}: ${error}`);
      }
    }

    await addFtTransferEvents(transferEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeFtTransferEvents(blockHash);
  },
});

export const getWithdrawalEventInfo = (
  contracts: string[] = []
): EventInfo => ({
  provider: baseProvider,
  filter: {
    topics: [abi.getEventTopic("Withdrawal")],
    address: contracts,
  },
  syncCallback: async (logs: Log[]) => {
    const transferEvents: FtTransferEvent[] = [];
    const makerInfos: MakerInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        const parsedLog = abi.parseLog(log);
        const tokenId = "-1";
        const from = parsedLog.args.from.toLowerCase();
        const to = "0x0000000000000000000000000000000000000000";
        const amount = parsedLog.args.amount.toString();

        transferEvents.push({
          from,
          to,
          amount,
          baseParams,
        });

        makerInfos.push({
          side: "buy",
          maker: from,
          contract: baseParams.address,
          tokenId,
        });
      } catch (error) {
        logger.error(
          "erc20_withdrawal_callback",
          `Invalid log ${log}: ${error}`
        );
      }
    }

    await addFtTransferEvents(transferEvents);
    if (config.acceptOrders) {
      await addToOrdersUpdateByMakerQueue(makerInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeFtTransferEvents(blockHash);
  },
});
