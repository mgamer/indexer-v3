import _ from "lodash";
import crypto from "crypto";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
  ActivityType,
} from "@/models/activities/activities-entity";

export class Activities {
  public static getTransactionId(transactionHash?: string, logIndex?: number, batchIndex?: number) {
    return crypto
      .createHash("sha256")
      .update(`${transactionHash}${logIndex}${batchIndex}`)
      .digest("hex");
  }

  public static async add(activity: ActivitiesEntityInsertParams) {
    const query = `
      INSERT INTO activities (
        transaction_id,
        type,
        contract,
        collection_id,
        token_id,
        address,
        from_address,
        to_address,
        price,
        amount,
        metadata
      )
      VALUES (
        $/transactionId/,
        $/type/,
        $/contract/,
        $/collectionId/,
        $/tokenId/,
        $/address/,
        $/fromAddress/,
        $/toAddress/,
        $/price/,
        $/amount/,
        $/metadata:json/
      )
      ON CONFLICT DO NOTHING
    `;

    await idb.none(query, {
      transactionId: activity.transactionId,
      type: ActivityType.sale,
      contract: toBuffer(activity.contract),
      collectionId: activity.collectionId,
      tokenId: activity.tokenId,
      address: toBuffer(activity.fromAddress),
      fromAddress: toBuffer(activity.fromAddress),
      toAddress: toBuffer(activity.toAddress),
      price: activity.price,
      amount: activity.amount,
      metadata: activity.metadata,
    });
  }

  public static async getCollectionActivities(
    collectionId: string,
    createdBefore: null | string = null,
    limit = 20
  ) {
    let continuation = "";
    if (!_.isNull(createdBefore)) {
      continuation = `AND created_at < $/createdBefore/`;
    }

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE collection_id = $/collectionId/
             ${continuation}
             ORDER BY created_at DESC
             LIMIT $/limit/`,
      {
        collectionId,
        limit,
        createdBefore,
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return null;
  }
}
