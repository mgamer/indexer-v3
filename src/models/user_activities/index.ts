import _ from "lodash";
import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

import {
  UserActivitiesEntity,
  UserActivitiesEntityInsertParams,
  UserActivitiesEntityParams,
} from "@/models/user_activities/user-activities-entity";

export class UserActivities {
  public static async addActivities(activities: UserActivitiesEntityInsertParams[]) {
    if (!activities.length) {
      return;
    }

    const columns = new pgp.helpers.ColumnSet(
      [
        "hash",
        "type",
        "contract",
        "collection_id",
        "token_id",
        "address",
        "from_address",
        "to_address",
        "price",
        "amount",
        "block_hash",
        "event_timestamp",
        "metadata",
      ],
      { table: "user_activities" }
    );

    const data = activities.map((activity) => ({
      type: activity.type,
      hash: activity.hash,
      contract: toBuffer(activity.contract),
      collection_id: activity.collectionId,
      token_id: activity.tokenId,
      address: toBuffer(activity.address),
      from_address: toBuffer(activity.fromAddress),
      to_address: activity.toAddress ? toBuffer(activity.toAddress) : null,
      price: activity.price,
      amount: activity.amount,
      block_hash: activity.blockHash,
      event_timestamp: activity.eventTimestamp,
      metadata: activity.metadata,
    }));

    const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING";

    await idb.none(query);
  }

  public static async getActivities(
    user: string,
    createdBefore: null | string = null,
    types: string[] = [],
    limit = 20
  ) {
    let continuation = "";
    let typesFilter = "";

    if (!_.isNull(createdBefore)) {
      continuation = `AND event_timestamp < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: UserActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM user_activities
             LEFT JOIN LATERAL (
                SELECT name AS "token_name", image AS "token_image"
                FROM tokens
                WHERE user_activities.contract = tokens.contract
                AND user_activities.token_id = tokens.token_id
             ) t ON TRUE
             LEFT JOIN LATERAL (
                SELECT name AS "collection_name", metadata AS "collection_metadata"
                FROM collections
                WHERE user_activities.collection_id = collections.id
             ) c ON TRUE
             WHERE address = $/user/
             ${continuation}
             ${typesFilter}
             ORDER BY event_timestamp DESC NULLS LAST
             LIMIT $/limit/`,
      {
        user: toBuffer(user),
        limit,
        createdBefore,
        types: _.join(types, "','"),
      }
    );

    if (activities) {
      return _.map(activities, (activity) => new UserActivitiesEntity(activity));
    }

    return [];
  }

  public static async deleteByBlockHash(blockHash: string) {
    const query = `DELETE FROM user_activities
                   WHERE block_hash = $/blockHash/`;

    return await idb.none(query, { blockHash });
  }

  public static async UpdateMissingCollectionId(
    contract: string,
    tokenId: string,
    collectionId: string
  ) {
    const query = `
          UPDATE user_activities SET
            collection_id = $/collectionId/
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
            AND tokens.collection_id IS NULL
        `;

    return await idb.none(query, {
      contract,
      tokenId,
      collectionId,
    });
  }
}
