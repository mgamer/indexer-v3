import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import {
  CancelEvent,
  addCancelEvents,
  removeCancelEvents,
} from "@/events/common/cancels";
import {
  FillEvent,
  addFillEvents,
  removeFillEvents,
} from "@/events/common/fills";
import { ContractInfo } from "@/events/index";
import { parseEvent } from "@/events/parser";
import { FillInfo, addToFillsHandleQueue } from "@/jobs/fills-handle";
import { HashInfo, addToOrdersUpdateByHashQueue } from "@/jobs/orders-update";

const abi = new Interface([
  `event OrderCancelled(
    bytes32 indexed hash
  )`,
  `event OrdersMatched(
    bytes32 buyHash,
    bytes32 sellHash,
    address indexed maker,
    address indexed taker,
    uint256 price,
    bytes32 indexed metadata
  )`,
]);

export const getContractInfo = (address: string[] = []): ContractInfo => ({
  provider: baseProvider,
  filter: { address },
  syncCallback: async (logs: Log[]) => {
    const cancelEvents: CancelEvent[] = [];
    const fillEvents: FillEvent[] = [];
    const hashInfos: HashInfo[] = [];
    const fillInfos: FillInfo[] = [];

    for (const log of logs) {
      try {
        const baseParams = parseEvent(log);

        switch (log.topics[0]) {
          case abi.getEventTopic("OrderCancelled"): {
            const parsedLog = abi.parseLog(log);
            const orderHash = parsedLog.args.hash.toLowerCase();

            cancelEvents.push({
              orderHash,
              baseParams,
            });

            hashInfos.push({ hash: orderHash });

            break;
          }

          case abi.getEventTopic("OrdersMatched"): {
            const parsedLog = abi.parseLog(log);
            const buyHash = parsedLog.args.buyHash.toLowerCase();
            const sellHash = parsedLog.args.sellHash.toLowerCase();
            const maker = parsedLog.args.maker.toLowerCase();
            const taker = parsedLog.args.taker.toLowerCase();
            const price = parsedLog.args.price.toString();

            fillEvents.push({
              buyHash,
              sellHash,
              maker,
              taker,
              price,
              baseParams,
            });

            hashInfos.push({ hash: buyHash });
            hashInfos.push({ hash: sellHash });
            fillInfos.push({
              buyHash,
              sellHash,
              price,
              block: baseParams.block,
            });

            break;
          }
        }
      } catch (error) {
        logger.error(
          "wyvern_v2_callback",
          `Could not parse log ${log}: ${error}`
        );
      }
    }

    await addCancelEvents("wyvern-v2", cancelEvents);
    await addFillEvents("wyvern-v2", fillEvents);

    logger.info("wyvern_v2_callback", "here1");
    if (config.acceptOrders) {
      logger.info("wyvern_v2_callback", "here2");
      await addToOrdersUpdateByHashQueue(hashInfos);
      await addToFillsHandleQueue(fillInfos);
    }
  },
  fixCallback: async (blockHash) => {
    await removeCancelEvents(blockHash);
    await removeFillEvents(blockHash);
  },
});
