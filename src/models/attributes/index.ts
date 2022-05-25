/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb } from "@/common/db";
import {
  AttributesEntity,
  AttributesEntityUpdateParams,
} from "@/models/attributes/attributes-entity";

export class Attributes {
  public static async incrementOnSaleCount(attributesId: number[], incrementBy: number) {
    const query = `UPDATE attributes
                   SET on_sale_count = CASE WHEN on_sale_count + $/incrementBy/ <= 0 THEN 0 ELSE on_sale_count + $/incrementBy/ END 
                   WHERE id IN ($/attributesId:raw/)`;

    return await idb.none(query, {
      attributesId: _.join(attributesId, ","),
      incrementBy,
    });
  }

  public static async getById(attributeId: number) {
    const query = `SELECT *
                   FROM attributes
                   WHERE id = $/attributeId/`;

    const attribute = await idb.oneOrNone(query, {
      attributeId,
    });

    if (attribute) {
      return new AttributesEntity(attribute);
    }

    return null;
  }

  public static async getAttributes(attributesId: number[]) {
    const query = `SELECT *
                   FROM attributes
                   WHERE id IN ($/attributesId:raw/)`;

    const attributes = await idb.manyOrNone(query, {
      attributesId: _.join(attributesId, ","),
    });

    if (attributes) {
      return _.map(attributes, (attribute) => new AttributesEntity(attribute));
    }

    return [];
  }

  public static async update(attributeId: number, fields: AttributesEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      attributeId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE attributes
                   SET ${updateString}
                   WHERE id = $/attributeId/`;

    return await idb.none(query, replacementValues);
  }

  public static async delete(attributeId: number) {
    const replacementValues = {
      attributeId,
    };

    const query = `DELETE FROM attributes
                   WHERE id = $/attributeId/`;

    return await idb.none(query, replacementValues);
  }

  public static async getAttributeByCollectionKeyValue(
    collectionId: string,
    key: string,
    value: string
  ) {
    const replacementValues = {
      collectionId,
      key,
      value,
    };

    const query = `SELECT *
                   FROM attributes
                   WHERE collection_id = $/collectionId/
                   AND key = $/key/
                   AND value = $/value/
                   LIMIT 1`;

    const attribute = await idb.oneOrNone(query, replacementValues);

    if (attribute) {
      return new AttributesEntity(attribute);
    }

    return null;
  }
}
