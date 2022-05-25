import { ActivityInfo } from "@/jobs/activities/index";
import {
  ActivitiesEntityInsertParams,
  ActivitySubject,
  ActivityType,
} from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";

export class MintActivity {
  public static async handleEvent(activity: ActivityInfo) {
    const activitiesParams: ActivitiesEntityInsertParams[] = [];
    const token = await Tokens.getByContractAndTokenId(activity.contract, activity.tokenId);

    // If no token found
    if (_.isNull(token)) {
      logger.error("mint-activity", `No token found for ${JSON.stringify(activity)}`);
      return;
    }

    const activityHash = Activities.getActivityHash(
      activity.metadata?.transactionHash,
      activity.metadata?.logIndex,
      activity.metadata?.batchIndex
    );

    const baseActivity = {
      subject: ActivitySubject.collection,
      type: ActivityType[activity.event],
      activityHash,
      contract: activity.contract,
      collectionId: token.collectionId,
      tokenId: activity.tokenId,
      address: activity.toAddress,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: activity.price,
      amount: activity.amount,
      metadata: activity.metadata,
    };

    // Create a token activity
    baseActivity.subject = ActivitySubject.token;
    activitiesParams.push(baseActivity);

    // One record for the user
    baseActivity.subject = ActivitySubject.user;
    activitiesParams.push(baseActivity);

    // Create a collection activity
    activitiesParams.push(baseActivity);

    await Activities.add(activitiesParams);
  }
}
