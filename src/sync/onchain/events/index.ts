import { Filter, Log } from "@ethersproject/abstract-provider";
import { Formatter, JsonRpcProvider } from "@ethersproject/providers";

import * as erc20 from "@/events/erc20";
import * as erc721 from "@/events/erc721";
import * as erc1155 from "@/events/erc1155";
import * as orderbook from "@/events/orderbook";
import * as wyvernV2 from "@/events/wyvern-v2";

// https://github.com/ethers-io/ethers.js/discussions/2168
interface EnhancedFilter extends Omit<Filter, "address"> {
  address?: string | string[];
}

export type ContractInfo = {
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
  syncCallback: (logs: Log[], backfill?: boolean) => Promise<void>;
  fixCallback: (blockHash: string) => Promise<void>;
  skip?: boolean;
};

export const sync = async (
  fromBlock: number,
  toBlock: number,
  contractInfo: ContractInfo,
  backfill?: boolean
) => {
  // https://github.com/ethers-io/ethers.js/discussions/2168
  const formatter = new Formatter();
  const rawLogs = await contractInfo.provider.send("eth_getLogs", [
    {
      ...contractInfo.filter,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    },
  ]);
  const logs = Formatter.arrayOf(formatter.filterLog.bind(formatter))(
    rawLogs
  ) as Log[];

  await contractInfo.syncCallback(logs, backfill);
};

// Newly added contract kinds should all make it into the below lists

export type ContractKind =
  | "orderbook"
  | "erc20"
  | "erc721"
  | "erc1155"
  | "wyvern-v2";

export const contractKinds: ContractKind[] = [
  "orderbook",
  "erc20",
  "erc721",
  "erc1155",
  "wyvern-v2",
];

export const getContractInfo = (
  contractKind: ContractKind,
  address: string[] = []
): ContractInfo => {
  switch (contractKind) {
    case "orderbook": {
      return orderbook.getContractInfo(address);
    }
    case "erc20": {
      return erc20.getContractInfo(address);
    }
    case "erc721": {
      return erc721.getContractInfo(address);
    }
    case "erc1155": {
      return erc1155.getContractInfo(address);
    }
    case "wyvern-v2": {
      return wyvernV2.getContractInfo(address);
    }
  }
};
