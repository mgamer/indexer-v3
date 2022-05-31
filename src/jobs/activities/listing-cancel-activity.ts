import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";
import { getActivityHash, getTimeSeconds } from "@/jobs/activities/utils";
import { NewSellOrderEventData } from "@/jobs/activities/listing-activity";
import { UserActivitiesEntityInsertParams } from "@/models/user_activities/user-activities-entity";
import { UserActivities } from "@/models/user_activities";

export class ListingCancelActivity {
  public static async handleEvent(data: SellOrderCancelledEventData) {
    const activityHash = getActivityHash(ActivityType.listing_cancel, data.orderId);

    const activity = {
      hash: activityHash,
      type: ActivityType.listing_cancel,
      contract: data.contract,
      collectionId: data.contract,
      tokenId: data.tokenId,
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

export type SellOrderCancelledEventData = NewSellOrderEventData;
