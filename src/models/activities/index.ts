import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import { toBuffer } from "@/common/utils";

export class Activities {
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
    `;

    await idb.none(query, {
      transactionId: randomUUID(),
      type: ActivityType.sale,
      contract: toBuffer(activity.contract),
      collectionId: activity.collectionId,
      tokenId: activity.tokenId,
      address: activity.fromAddress,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: activity.price,
      amount: activity.amount,
      metadata: activity.metadata,
    });
  }
}
