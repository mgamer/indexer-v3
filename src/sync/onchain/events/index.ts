import { Filter, Log } from "@ethersproject/abstract-provider";
import { Formatter, JsonRpcProvider } from "@ethersproject/providers";

import * as orderbook from "@/events/orderbook";
import * as erc20 from "@/events/transfers/erc20";
import * as erc721 from "@/events/transfers/erc721";
import * as erc1155 from "@/events/transfers/erc1155";
import * as wyvernV2 from "@/events/wyvern-v2";

// https://github.com/ethers-io/ethers.js/discussions/2168
interface EnhancedFilter extends Omit<Filter, "address"> {
  address?: string | string[];
}

export type EventInfo = {
  // The indexer is designed to be working on a single network
  // at once. As such, for all syncing processes we should be
  // using the base network provider. However, in order to reuse
  // the syncing methods for other various processes (eg. syncing
  // orderbook events which for now are retrieved from a different
  // chain), we require explicitly passing the provider. This can
  // be ditched once we no longer need syncing events from different
  // chains, since it creates some useless complexities.
  provider: JsonRpcProvider;
  filter: EnhancedFilter;
  syncCallback: (logs: Log[]) => Promise<void>;
  fixCallback: (blockHash: string) => Promise<void>;
  skip?: boolean;
};

export const sync = async (
  fromBlock: number,
  toBlock: number,
  eventInfo: EventInfo
) => {
  // https://github.com/ethers-io/ethers.js/discussions/2168
  const formatter = new Formatter();
  const rawLogs = await eventInfo.provider.send("eth_getLogs", [
    {
      ...eventInfo.filter,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    },
  ]);
  const logs = Formatter.arrayOf(formatter.filterLog.bind(formatter))(
    rawLogs
  ) as Log[];

  console.time(`${logs.length}`);
  await eventInfo.syncCallback(logs);
  console.timeEnd(`${logs.length}`);
};

// Newly added events should all make it into the below lists

export type EventType =
  | "orderbook_orders_posted"
  | "erc20_transfer"
  | "erc20_deposit"
  | "erc20_withdrawal"
  | "erc721_transfer"
  | "erc1155_transfer_single"
  | "erc1155_transfer_batch"
  | "wyvern_v2_order_cancelled"
  | "wyvern_v2_orders_matched";

export const eventTypes: EventType[] = [
  "orderbook_orders_posted",
  "erc20_transfer",
  "erc20_deposit",
  "erc20_withdrawal",
  "erc721_transfer",
  "erc1155_transfer_single",
  "erc1155_transfer_batch",
  "wyvern_v2_order_cancelled",
  "wyvern_v2_orders_matched",
];

export const getEventInfo = (
  eventType: EventType,
  contracts: string[] = []
): EventInfo => {
  switch (eventType) {
    case "orderbook_orders_posted": {
      return orderbook.getOrdersPostedEventInfo(contracts);
    }
    case "erc20_transfer": {
      return erc20.getTransferEventInfo(contracts);
    }
    case "erc20_deposit": {
      return erc20.getDepositEventInfo(contracts);
    }
    case "erc20_withdrawal": {
      return erc20.getWithdrawalEventInfo(contracts);
    }
    case "erc721_transfer": {
      return erc721.getTransferEventInfo(contracts);
    }
    case "erc1155_transfer_single": {
      return erc1155.getTransferSingleEventInfo(contracts);
    }
    case "erc1155_transfer_batch": {
      return erc1155.getTransferBatchEventInfo(contracts);
    }
    case "wyvern_v2_order_cancelled": {
      return wyvernV2.getOrderCancelledEventInfo(contracts);
    }
    case "wyvern_v2_orders_matched": {
      return wyvernV2.getOrdersMatchedEventInfo(contracts);
    }
  }
};
