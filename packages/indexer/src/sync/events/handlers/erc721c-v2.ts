import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as erc721cV2 from "@/utils/erc721c-v2";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc721c-v2-applied-list-to-collection":
      case "erc721c-set-transfer-security-level": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["collection"].toLowerCase();
        await erc721cV2.refreshERC721CV2Config(collection);
        break;
      }

      case "erc721c-transfer-validator-updated": {
        await erc721cV2.refreshERC721CV2Config(baseEventParams.address);
        break;
      }

      case "erc721c-v2-removed-account-from-list":
      case "erc721c-v2-removed-code-hash-from-list":
      case "erc721c-v2-added-account-to-list":
      case "erc721c-v2-added-code-hash-to-list": {
        const parsedLog = eventData.abi.parseLog(log);
        const id = parsedLog.args["id"].toString();
        const transferValidator = baseEventParams.address.toLowerCase();

        parsedLog.args.kind === 0
          ? await erc721cV2.refreshERC721CV2Blacklist(transferValidator, id)
          : await erc721cV2.refreshERC721CV2Whitelist(transferValidator, id);

        break;
      }
    }
  }
};
