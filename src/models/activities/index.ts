import _ from "lodash";
import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
} from "@/models/activities/activities-entity";

export class Activities {
  public static async addActivities(activities: ActivitiesEntityInsertParams[]) {
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
        "from_address",
        "to_address",
        "price",
        "amount",
        "block_hash",
        "event_timestamp",
        "metadata",
      ],
      { table: "activities" }
    );

    const data = activities.map((activity) => ({
      type: activity.type,
      hash: activity.hash,
      contract: toBuffer(activity.contract),
      collection_id: activity.collectionId,
      token_id: activity.tokenId,
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

  public static async deleteByBlockHash(blockHash: string) {
    const query = `DELETE FROM activities
                   WHERE block_hash = $/blockHash/`;

    return await idb.none(query, { blockHash });
  }

  public static async updateMissingCollectionId(
    contract: string,
    tokenId: string,
    collectionId: string
  ) {
    const query = `
          UPDATE activities SET
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

  public static async getCollectionActivities(
    collectionId: string,
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

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE collection_id = $/collectionId/
             ${continuation}
             ${typesFilter}
             ORDER BY event_timestamp DESC NULLS LAST
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

    return [];
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
      continuation = `AND event_timestamp < $/createdBefore/`;
    }

    if (!_.isEmpty(types)) {
      typesFilter = `AND type IN ('$/types:raw/')`;
    }

    const activities: ActivitiesEntityParams[] | null = await idb.manyOrNone(
      `SELECT *
             FROM activities
             WHERE contract = $/contract/
             AND token_id = $/tokenId/
             ${continuation}
             ${typesFilter}
             ORDER BY event_timestamp DESC NULLS LAST
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

    return [];
  }
}
