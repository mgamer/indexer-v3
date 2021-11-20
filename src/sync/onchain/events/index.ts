import { Filter, Log } from "@ethersproject/abstract-provider";
import { Formatter } from "@ethersproject/providers";

import { baseProvider } from "../../../common/provider";
import * as erc20 from "./transfers/erc20";
import * as erc1155 from "./transfers/erc1155";
import * as erc721 from "./transfers/erc721";

// https://github.com/ethers-io/ethers.js/discussions/2168
interface EnhancedFilter extends Omit<Filter, "address"> {
  address?: string | string[];
}

export type EventInfo = {
  filter: EnhancedFilter;
  syncCallback: (logs: Log[]) => Promise<void>;
  fixCallback: (blockHash: string) => Promise<void>;
};

export const sync = async (
  fromBlock: number,
  toBlock: number,
  eventInfo: EventInfo
) => {
  // https://github.com/ethers-io/ethers.js/discussions/2168
  const formatter = new Formatter();
  const rawLogs = await baseProvider.send("eth_getLogs", [
    {
      ...eventInfo.filter,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    },
  ]);
  const logs = Formatter.arrayOf(formatter.filterLog.bind(formatter))(
    rawLogs
  ) as Log[];

  await eventInfo.syncCallback(logs);
};

// Newly added events should all make it into the below lists

export type EventType =
  | "erc20_transfer"
  | "erc721_transfer"
  | "erc1155_transfer_single"
  | "erc1155_transfer_batch";

export const eventTypes: EventType[] = [
  "erc20_transfer",
  "erc721_transfer",
  "erc1155_transfer_single",
  "erc1155_transfer_batch",
];

export const getEventInfo = (
  eventType: EventType,
  contracts: string[] = []
): EventInfo => {
  switch (eventType) {
    case "erc20_transfer": {
      return erc20.getTransferEventInfo(contracts);
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
  }
};
