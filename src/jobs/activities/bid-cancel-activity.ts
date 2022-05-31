import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";
import { getActivityHash, getBidInfoByOrderId, getTimeSeconds } from "@/jobs/activities/utils";
import { NewBuyOrderEventData } from "@/jobs/activities/bid-activity";
import { UserActivitiesEntityInsertParams } from "@/models/user_activities/user-activities-entity";
import { UserActivities } from "@/models/user_activities";

export class BidCancelActivity {
  public static async handleEvent(data: BuyOrderCancelledEventData) {
    const [collectionId, tokenId] = await getBidInfoByOrderId(data.orderId);

    // If no collection found
    if (!collectionId) {
      logger.warn("bid-activity", `No collection found for ${JSON.stringify(data)}`);
    }

    const activityHash = getActivityHash(ActivityType.listing, data.orderId);

    const activity = {
      type: ActivityType.bid_cancel,
      hash: activityHash,
      contract: data.contract,
      collectionId: collectionId,
      tokenId: tokenId,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      blockHash: null,
      eventTimestamp: getTimeSeconds(data.createdAt),
      metadata: {
        orderId: data.orderId,
      },
    } as ActivitiesEntityInsertParams;

    // One record for the user to address, One record for the user from address
    const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

    fromUserActivity.address = data.maker;

    await Promise.all([
      Activities.addActivities([activity]),
      UserActivities.addActivities([fromUserActivity]),
    ]);
  }
}

export type BuyOrderCancelledEventData = NewBuyOrderEventData;
