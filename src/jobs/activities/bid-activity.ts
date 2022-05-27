import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";
import { getActivityHash, getBidInfoByOrderId } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user_activities/user-activities-entity";
import { UserActivities } from "@/models/user_activities";

export class BidActivity {
  public static async handleEvent(data: NewBuyOrderData) {
    const [collectionId, tokenId] = await getBidInfoByOrderId(data.orderId);

    // If no collection found
    if (!collectionId) {
      logger.error("bid-activity", `No collection found for ${JSON.stringify(data)}`);
      return;
    }

    const activityHash = getActivityHash(ActivityType.listing, data.orderId);

    const activity = {
      type: ActivityType.bid,
      hash: activityHash,
      contract: data.contract,
      collectionId: collectionId,
      tokenId: tokenId,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      blockHash: null,
      eventTimestamp: new Date(data.createdAt).getTime(),
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

export type NewBuyOrderData = {
  orderId: string;
  contract: string;
  maker: string;
  price: number;
  amount: number;
  createdAt: string;
};
