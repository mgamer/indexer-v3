import { AddressZero } from "@ethersproject/constants";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";

import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const nftTransferEvents: es.nftTransfers.Event[] = [];

  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];
  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "beeple-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();

        nftTransferEvents.push({
          kind: "beeple",
          from,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

        makerInfos.push({
          context: `${contextPrefix}-${from}-sell-balance`,
          maker: from,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "sell-balance",
            contract: baseEventParams.address,
            tokenId,
          },
        });

        makerInfos.push({
          context: `${contextPrefix}-${to}-sell-balance`,
          maker: to,
          trigger: {
            kind: "balance-change",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          data: {
            kind: "sell-balance",
            contract: baseEventParams.address,
            tokenId,
          },
        });

        if (from === AddressZero) {
          mintInfos.push({
            contract: baseEventParams.address,
            tokenId,
            mintedTimestamp: baseEventParams.timestamp,
          });
        }

        break;
      }
    }
  }

  return {
    nftTransferEvents,

    makerInfos,
    mintInfos,
  };
};
