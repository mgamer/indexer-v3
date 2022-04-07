/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { TokensEntity, TokensEntityParams, TokensEntityUpdateParams } from "./tokens-entity";
import _ from "lodash";
import { logger } from "@/common/logger";
import PgPromise from "pg-promise";

export type TokenAttributes = {
  attributeId: number;
  key: string;
  value: string;
  attributeKeyId: number;
  collectionId: string;
  floorSellValue: number | null;
};

export class Tokens {
  public static async getByContractAndTokenId(contract: string, tokenId: string) {
    const token: TokensEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM tokens
              WHERE contract = $/contract/
              AND token_id = $/tokenId/`,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (token) {
      return new TokensEntity(token);
    }

    return null;
  }

  public static async update(contract: string, tokenId: string, fields: TokensEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      contract: toBuffer(contract),
      tokenId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `UPDATE tokens
                   SET ${updateString}
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    return await idb.none(query, replacementValues);
  }

  public static async getTokenAttributes(contract: string, tokenId: string) {
    const query = `SELECT attribute_id AS "attributeId", key, token_attributes.value, attribute_key_id AS "attributeKeyId",
                          collection_id AS "collectionId", floor_sell_value AS "floorSellValue"
                   FROM token_attributes
                   JOIN attributes ON token_attributes.attribute_id = attributes.id
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    return (await idb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenId,
    })) as TokenAttributes[];
  }

  /**
   * Return the lowest sell price and number of tokens on sale for the given attribute
   * @param collection
   * @param attributeKey
   * @param attributeValue
   */
  public static async getSellFloorValueAndOnSaleCount(
    collection: string,
    attributeKey: string,
    attributeValue: string
  ) {
    const query = `SELECT COUNT(*) AS "onSaleCount", MIN(floor_sell_value) AS "floorSellValue"
                   FROM token_attributes
                   JOIN tokens ON token_attributes.contract = tokens.contract AND token_attributes.token_id = tokens.token_id
                   WHERE token_attributes.collection_id = $/collection/
                   AND key = $/attributeKey/
                   AND value = $/attributeValue/
                   AND floor_sell_value IS NOT NULL`;

    const result = await idb.oneOrNone(query, {
      collection,
      attributeKey,
      attributeValue,
    });

    logger.info(
      "get-attributes-data",
      `Update query ${PgPromise.as.format(query, {
        collection,
        attributeKey,
        attributeValue,
      })}, result = ${JSON.stringify(result)}`
    );

    if (result) {
      return { floorSellValue: result.floorSellValue, onSaleCount: result.onSaleCount };
    }

    return { floorSellValue: null, onSaleCount: 0 };
  }
}
