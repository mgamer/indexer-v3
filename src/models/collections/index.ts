/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import {
  CollectionsEntity,
  CollectionsEntityParams,
  CollectionsEntityUpdateParams,
} from "./collections-entity";
import { toBuffer } from "@/common/utils";
import MetadataApi from "@/utils/metadata-api";
import _ from "lodash";
import { Tokens } from "@/models/tokens";

export class Collections {
  public static async getById(collectionId: string) {
    const collection: CollectionsEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM collections
              WHERE id = $/collectionId/`,
      {
        collectionId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async getByContractAndTokenId(contract: string, tokenId: number) {
    const collection: CollectionsEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM collections
              WHERE contract = $/contract/
              AND token_id_range @> $/tokenId/::NUMERIC(78, 0)`,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async updateCollectionCache(contract: string, tokenId: string) {
    const collection = await MetadataApi.getCollectionMetadata(contract, tokenId);
    const tokenCount = await Tokens.countTokensInCollection(collection.id);

    const query = `UPDATE collections
                   SET metadata = $/metadata:json/, name = $/name/, royalties = $/royalties:json/,
                       slug = $/slug/, token_count = $/tokenCount/
                   WHERE id = $/id/`;

    const values = {
      id: collection.id,
      metadata: collection.metadata,
      name: collection.name,
      royalties: collection.royalties,
      slug: collection.slug,
      tokenCount,
    };

    await idb.none(query, values);
  }

  public static async update(collectionId: string, fields: CollectionsEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      collectionId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE collections
                   SET ${updateString}
                   WHERE id = $/collectionId/`;

    return await idb.none(query, replacementValues);
  }

  public static async getCollectionsMintedBetween(from: number, to: number, limit = 2000) {
    const query = `SELECT *
                   FROM collections
                   WHERE minted_timestamp > ${from}
                   AND minted_timestamp < ${to}
                   ORDER BY minted_timestamp ASC
                   LIMIT ${limit}`;

    const collections = await idb.manyOrNone(query);

    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async getTopCollectionsByVolume(limit = 500) {
    const query = `SELECT *
                   FROM collections
                   ORDER BY day1_volume DESC
                   LIMIT ${limit}`;

    const collections = await idb.manyOrNone(query);

    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }
}
