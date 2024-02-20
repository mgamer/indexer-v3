import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as marketplaceBlacklists from "@/utils/marketplace-blacklists";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "operator-filter-operator-updated":
      case "operator-filter-subscription-updated": {
        const { args } = eventData.abi.parseLog(log);
        const contract = args["registrant"].toLowerCase();

        await marketplaceBlacklists.updateMarketplaceBlacklist(contract);

        break;
      }
    }
  }
};
