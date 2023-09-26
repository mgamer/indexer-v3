import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import * as erc721c from "@/utils/erc721c";
import { logger } from "@/common/logger";

export const handleEvents = async (events: EnhancedEvent[]) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc721c-verified-eoa-signature": {
        const parsedLog = eventData.abi.parseLog(log);
        const transferValidator = baseEventParams.address.toLowerCase();
        const address = parsedLog.args["account"].toLowerCase();

        await erc721c.saveVerifiedEOA(transferValidator, address);

        break;
      }

      case "erc721c-set-allowlist":
      case "erc721c-set-transfer-security-level": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["collection"].toLowerCase();
        logger.info(
          "refresh-erc721c-config",
          `Satrt to refresh erc721c config after erc721c-set-transfer-security-level, contract=${collection}`
        );
        await erc721c.refreshERC721CConfig(collection);
        break;
      }

      case "erc721c-transfer-validator-updated": {
        logger.info(
          "refresh-erc721c-config",
          `Satrt to refresh erc721c config after erc721c-transfer-validator-updated, contract=${baseEventParams.address}`
        );
        await erc721c.refreshERC721CConfig(baseEventParams.address);
        break;
      }

      case "erc721c-removed-from-allowlist":
      case "erc721c-added-to-allowlist": {
        const parsedLog = eventData.abi.parseLog(log);
        const id = parsedLog.args["id"].toString();
        const transferValidator = baseEventParams.address.toLowerCase();

        parsedLog.args.kind === 0
          ? await erc721c.refreshERC721COperatorWhitelist(transferValidator, id)
          : await erc721c.refreshERC721CPermittedContractReceiverAllowlist(transferValidator, id);

        break;
      }
    }
  }
};
