import {
  ActivitiesEntityInsertParams,
  ActivitySubject,
  ActivityType,
} from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { logger } from "@/common/logger";
import { Activities } from "@/models/activities";
import { idb } from "@/common/db";
import { Attributes } from "@/models/attributes";
import { Collections } from "@/models/collections";

export class BidCancelActivity {
  public static async handleEvent(data: BuyOrderCancelledData) {
    const activitiesParams: ActivitiesEntityInsertParams[] = [];

    let tokenId = null;
    let collectionId;

    const tokenSetByOrderIdResult = await idb.oneOrNone(
      `
                SELECT
                  ts.token_set_id
                  ts.attribute_id
                FROM orders
                JOIN token_sets ts
                  ON orders.token_set_id = ts.token_set_id
                WHERE orders.id = $/orderId/
                LIMIT 1
            `,
      {
        orderId: data.orderId,
      }
    );

    if (tokenSetByOrderIdResult.token_set_id.startsWith("token:")) {
      [, , tokenId] = tokenSetByOrderIdResult.token_set_id.split(":");

      const token = await Tokens.getByContractAndTokenId(data.contract, tokenId);
      collectionId = token?.collectionId;
    } else if (tokenSetByOrderIdResult.token_set_id.startsWith("list:")) {
      const attribute = await Attributes.getById(tokenSetByOrderIdResult.attribute_id);
      collectionId = attribute?.collectionId;
    } else if (tokenSetByOrderIdResult.token_set_id.startsWith("range:")) {
      const collection = await Collections.getByTokenSetId(tokenSetByOrderIdResult.token_set_id);
      collectionId = collection?.id;
    } else {
      collectionId = data.contract;
    }

    // If no collection found
    if (!collectionId) {
      logger.error("bid-activity", `No collection found for ${JSON.stringify(data)}`);
      return;
    }

    const activityHash = Activities.getActivityHash(ActivityType.listing, data.orderId);

    const baseActivity: ActivitiesEntityInsertParams = {
      subject: ActivitySubject.collection,
      type: ActivityType.bid,
      activityHash,
      contract: data.contract,
      collectionId: collectionId,
      tokenId: tokenId,
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

    // One record for the user from address
    baseActivity.subject = ActivitySubject.user;
    activitiesParams.push(_.clone(baseActivity));

    if (tokenId) {
      // Create a token activity
      baseActivity.subject = ActivitySubject.token;
      activitiesParams.push(_.clone(baseActivity));
    }

    await Activities.add(activitiesParams);
  }
}

export type BuyOrderCancelledData = {
  orderId: string;
  contract: string;
  maker: string;
  price: number;
  amount: number;
};
