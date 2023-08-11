import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { saveTransferValidatorEOA, refreshConfig } from "@/utils/creator-token";

export const handleEvents = async (events: EnhancedEvent[]) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "creator-token-verified-eoa-signature": {
        const parsedLog = eventData.abi.parseLog(log);
        const validator = baseEventParams.address.toLowerCase();
        const account = parsedLog.args["account"].toLowerCase();
        await saveTransferValidatorEOA(validator, account);
        break;
      }

      case "creator-token-removed-from-allowlist":
      case "creator-token-added-to-allowlist": {
        const parsedLog = eventData.abi.parseLog(log);
        const listId = parsedLog.args["id"].toString();
        const validator = baseEventParams.address.toLowerCase();
        const triggerType = parsedLog.args.kind === 0 ? "operator" : "receiver";
        await refreshConfig(validator, listId, triggerType);
        break;
      }
    }
  }
};
