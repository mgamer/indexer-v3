import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { Contract } from "ethers";
import { mintManagerInterface } from "@/orderbook/mints/calldata/detector/highlightxyz";
import { baseProvider } from "@/common/provider";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "highlightxyz-edition-vector-created":
      case "highlightxyz-series-vector-created":
      case "highlightxyz-vector-updated":
      case "highlightxyz-vector-deleted": {
        const parsedLog = eventData.abi.parseLog(log);
        const vectorId = parsedLog.args["vectorId"];

        const mintManager = new Contract(
          Sdk.HighlightXYZ.Addresses.MintManager[config.chainId],
          mintManagerInterface,
          baseProvider
        );

        const vector = await mintManager.getAbridgedVector(vectorId);
        const collection = vector.contractAddress;

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "highlightxyz",
            collection,
            additionalInfo: {
              vectorId,
            },
          },
        });

        break;
      }
      case "highlightxyz-discrete-da-created":
      case "highlightxyz-mechanic-vector-registered":
      case "highlightxyz-discrete-da-updated": {
        const parsedLog = eventData.abi.parseLog(log);
        const vectorId = parsedLog.args["vectorId"];

        const mintManager = new Contract(
          Sdk.HighlightXYZ.Addresses.MintManager[config.chainId],
          mintManagerInterface,
          baseProvider
        );

        const vector = await mintManager.mechanicVectorMetadata(vectorId);
        const collection = vector.contractAddress;

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "highlightxyz",
            collection,
            additionalInfo: {
              vectorId,
            },
          },
        });

        break;
      }
    }
  }
};
