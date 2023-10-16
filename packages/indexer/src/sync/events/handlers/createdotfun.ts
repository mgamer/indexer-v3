import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "createdotfun-module-added": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = baseEventParams.address.toLowerCase();
        const module = parsedLog.args["module"].toLowerCase();

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "createdotfun",
            collection,
            additionalInfo: {
              module,
            },
          },
        });

        break;
      }
    }
  }
};
