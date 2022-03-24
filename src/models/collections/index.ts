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

  public static async updateCollectionMetadata(contract: string, tokenId: string) {
    const collection = await MetadataApi.getCollectionMetadata(contract, tokenId);

    const query = `UPDATE collections
                   SET metadata = $/metadata:json/, name = $/name/
                   WHERE id = $/id/`;

    const values = {
      id: collection.id,
      metadata: collection.metadata,
      name: collection.name,
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
}
