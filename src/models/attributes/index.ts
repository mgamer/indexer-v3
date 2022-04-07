/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb } from "@/common/db";
import {
  AttributesEntity,
  AttributesEntityUpdateParams,
} from "@/models/attributes/attributes-entity";
import { logger } from "@/common/logger";
import PgPromise from "pg-promise";

export class Attributes {
  public static async incrementOnSaleCount(attributesId: number[], incrementBy: number) {
    const query = `UPDATE attributes
                   SET on_sale_count = CASE WHEN on_sale_count + $/incrementBy/ <= 0 THEN 0 ELSE on_sale_count + $/incrementBy/ END 
                   WHERE id IN ($/attributesId:raw/)`;

    logger.info(
      "update-attribute-queue",
      PgPromise.as.format(query, {
        attributesId: _.join(attributesId, ","),
        incrementBy,
      })
    );

    return await idb.none(query, {
      attributesId: _.join(attributesId, ","),
      incrementBy,
    });
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

    logger.info(
      "update-attributes",
      `Decrement sales ${PgPromise.as.format(query, replacementValues)}`
    );

    return await idb.none(query, replacementValues);
  }
}
