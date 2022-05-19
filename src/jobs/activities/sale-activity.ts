import { ActivityInfo } from "@/jobs/activities/index";
import { idb } from "@/common/db";
import { ActivityType } from "@/models/activities/activities-entity";
import { toBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { logger } from "@/common/logger";

export class SaleActivity {
  public static async handleEvent(activity: ActivityInfo) {
    const token = await Tokens.getByContractAndTokenId(activity.contract, activity.tokenId);

    // If no token found
    if (_.isNull(token)) {
      logger.error("sale-activity", `No token found for ${JSON.stringify(activity)}`);
      return;
    }

    const query = `
      INSERT INTO activities (tx_hash, type, contract, collection_id, token_id, address, from_address, to_address, price, amount)
      VALUES ($/transactionHash/, $/type/, $/contract/, $/collectionId/, $/tokenId/, $/address/, $/fromAddress/, $/toAddress/, $/price/, $/amount/)
    `;

    await idb.none(query, {
      type: ActivityType.sale,
      transactionHash: toBuffer(activity.transactionHash),
      contract: toBuffer(activity.contract),
      collectionId: token?.collectionId,
      tokenId: activity.tokenId,
      address: activity.fromAddress,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: activity.price,
      amount: activity.amount,
    });
  }
}
