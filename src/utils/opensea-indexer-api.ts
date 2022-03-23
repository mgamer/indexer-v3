import { config } from "../config";
import axios from "axios";

import { logger } from "@/common/logger";

export class OpenseaIndexerApi {
  static async fastTokenSync(token: string) {
    return await axios
      .post(`${config.openseaIndexerApiBaseUrl}/fast-token-sync`, { token }, { timeout: 60000 })
      .catch((error) => {
        logger.error("fast_token_sync", `Failed to sync token=${token}, error=${error}`);
        throw error;
      });
  }

  static async fastContractSync(contract: string) {
    return await axios
      .post(
        `${config.openseaIndexerApiBaseUrl}/fast-contract-sync`,
        { contract },
        { timeout: 60000 }
      )
      .catch((error) => {
        logger.error("fast_token_sync", `Failed to sync contract=${contract}, error=${error}`);
        throw error;
      });
  }
}

export { OpenseaIndexerApi as default };
