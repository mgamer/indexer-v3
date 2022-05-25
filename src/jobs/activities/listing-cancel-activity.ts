import {
  ActivitiesEntityInsertParams,
  ActivitySubject,
  ActivityType,
} from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";

export class ListingCancelActivity {
  public static async handleEvent(data: SellOrderCancelledData) {
    const activitiesParams: ActivitiesEntityInsertParams[] = [];

    const activityHash = Activities.getActivityHash(ActivityType.listing_cancel, data.orderId);

    const baseActivity = {
      subject: ActivitySubject.collection,
      activityHash,
      type: ActivityType.listing_cancel,
      contract: data.contract,
      collectionId: data.contract,
      tokenId: data.tokenId,
      address: data.maker,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      metadata: {
        orderId: data.orderId,
      },
    };

    // Create a collection activity
    activitiesParams.push(_.clone(baseActivity));

    // Create a token activity
    baseActivity.subject = ActivitySubject.token;
    activitiesParams.push(_.clone(baseActivity));

    // One record for the user from address
    baseActivity.subject = ActivitySubject.user;
    activitiesParams.push(_.clone(baseActivity));

    await Activities.add(activitiesParams);
  }
}

export type SellOrderCancelledData = {
  orderId: string;
  contract: string;
  tokenId: string;
  maker: string;
  price: number;
  amount: number;
};
