import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import crypto from "crypto";

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
      address: activity.fromAddress,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      price: activity.price,
      amount: activity.amount,
      metadata: activity.metadata,
    });
  }
}
