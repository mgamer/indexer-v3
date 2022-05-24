import { ActivityInfo } from "@/jobs/activities/index";
import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";

export class SaleActivity {
  public static async handleEvent(activity: ActivityInfo) {
    const token = await Tokens.getByContractAndTokenId(activity.contract, activity.tokenId);

    // If no token found
    if (_.isNull(token)) {
      logger.error("sale-activity", `No token found for ${JSON.stringify(activity)}`);
      return;
    }

    const transactionId = Activities.getTransactionId(
      activity.metadata?.transactionHash,
      activity.metadata?.logIndex,
      activity.metadata?.batchIndex
    );

    // Insert 2 records one for each side of the sale
    const activityParams: ActivitiesEntityInsertParams = {
      type: ActivityType[activity.event],
      transactionId,
      contract: activity.contract,
      collectionId: token.collectionId,
      tokenId: activity.tokenId,
      address: activity.fromAddress,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: activity.price,
      amount: activity.amount,
      metadata: activity.metadata,
      timestamp: new Date(Number(activity.timestamp)).toISOString(),
    };

    // One record for the from address
    await Activities.add(activityParams);

    // One record for the to address
    activityParams.address = activity.toAddress;
    await Activities.add(activityParams);
  }
}
