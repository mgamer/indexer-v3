import _ from "lodash";
import crypto from "crypto";
import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
  ActivitySubject,
} from "@/models/activities/activities-entity";

export class Activities {
  public static getActivityHash(transactionHash?: string, logIndex?: number, batchIndex?: number) {
    return crypto
      .createHash("sha256")
      .update(`${transactionHash}${logIndex}${batchIndex}`)
      .digest("hex");
  }

  public static async add(activities: ActivitiesEntityInsertParams[]) {
    const queries: PgPromiseQuery[] = [];

    const query = `
      INSERT INTO activities (
        subject,
        activity_hash,
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
        $/subject/,
        $/activityHash/,
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

    for (const activity of activities) {
      queries.push({
        query,
        values: {
          subject: activity.subject,
          type: activity.type,
          activityHash: activity.activityHash,
          contract: toBuffer(activity.contract),
          collectionId: activity.collectionId,
          tokenId: activity.tokenId,
          address: toBuffer(activity.address),
          fromAddress: toBuffer(activity.fromAddress),
          toAddress: toBuffer(activity.toAddress),
          price: activity.price,
          amount: activity.amount,
          metadata: activity.metadata,
        },
      });
    }

    await idb.none(pgp.helpers.concat(queries));
  }

  public static async getCollectionActivities(
    collectionId: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20
  ) {
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND created_at < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE subject = '${ActivitySubject.collection}'
             AND collection_id = $/collectionId/
             ${continuation}
             ${typesFilter}
             ORDER BY created_at DESC NULLS LAST
             LIMIT $/limit/`,
      {
        collectionId,
        limit,
        createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return null;
  }

  public static async getTokenActivities(
    contract: string,
    tokenId: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20
  ) {
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND created_at < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE subject = '${ActivitySubject.token}'
             AND contract = $/contract/
             AND token_id = $/tokenId/
             ${continuation}
             ${typesFilter}
             ORDER BY created_at DESC NULLS LAST
             LIMIT $/limit/`,
      {
        contract: toBuffer(contract),
        tokenId,
        limit,
        createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return null;
  }

  public static async getUserActivities(
    user: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20
  ) {
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND created_at < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE subject = '${ActivitySubject.user}'
             AND address = $/user/
             ${continuation}
             ${typesFilter}
             ORDER BY created_at DESC NULLS LAST
             LIMIT $/limit/`,
      {
        user: toBuffer(user),
        limit,
        createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new ActivitiesEntity(activity));
    }

    return null;
  }
}
