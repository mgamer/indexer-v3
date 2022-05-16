/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { TokensEntity, TokensEntityParams, TokensEntityUpdateParams } from "./tokens-entity";
import _ from "lodash";

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
    const query = `SELECT attribute_id AS "attributeId", token_attributes.key, token_attributes.value, attribute_key_id AS "attributeKeyId",
                          token_attributes.collection_id AS "collectionId", floor_sell_value AS "floorSellValue"
                   FROM token_attributes
                   JOIN attributes ON token_attributes.attribute_id = attributes.id
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    return (await idb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenId,
    })) as TokenAttributes[];
  }

  public static async getTokenAttributesKeyCount(collection: string, key: string) {
    const query = `SELECT count(DISTINCT value) AS count
                   FROM token_attributes
                   WHERE collection_id = $/collection/
                   and key = $/key/
                   GROUP BY key`;

    return await idb.oneOrNone(query, {
      collection,
      key,
    });
  }

  public static async getTokenAttributesValueCount(collection: string, key: string, value: string) {
    const query = `SELECT attribute_id AS "attributeId", count(*) AS count
                   FROM token_attributes
                   WHERE collection_id = $/collection/
                   AND key = $/key/
                   AND value = $/value/
                   GROUP BY key, value, attribute_id`;

    return await idb.oneOrNone(query, {
      collection,
      key,
      value,
    });
  }

  public static async countTokensInCollection(collectionId: string) {
    const query = `SELECT count(*) AS count
                   FROM tokens
                   WHERE collection_id = $/collectionId/`;

    return await idb
      .oneOrNone(query, {
        collectionId,
      })
      .then((result) => (result ? result.count : 0));
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

    if (result) {
      return { floorSellValue: result.floorSellValue, onSaleCount: result.onSaleCount };
    }

    return { floorSellValue: null, onSaleCount: 0 };
  }

  public static async recalculateTokenFloorSell(contract: string, tokenId: string) {
    const values = {
      contract: toBuffer(contract),
      tokenId,
    };

    const query = `
      UPDATE "tokens" "t" SET
        "floor_sell_id" = "x"."id",
        "floor_sell_value" = "x"."value",
        "floor_sell_maker" = "x"."maker",
        "floor_sell_valid_from" = least(
          2147483647::NUMERIC,
          date_part('epoch', lower("x"."valid_between"))
        )::INT,
        "floor_sell_valid_to" = least(
          2147483647::NUMERIC,
          coalesce(
            nullif(date_part('epoch', upper("x"."valid_between")), 'Infinity'),
            0
          )
        )::INT,
        "floor_sell_source_id" = "x"."source_id",
        "floor_sell_source_id_int" = "x"."source_id_int",
        "floor_sell_is_reservoir" = "x"."is_reservoir"
      FROM (
        SELECT DISTINCT ON ("t"."contract", "t"."token_id")
          "t"."contract",
          "t"."token_id",
          "o"."id",
          "o"."value",
          "o"."maker",
          "o"."valid_between",
          "o"."source_id",
          "o"."source_id_int",
          "o"."is_reservoir"
        FROM "tokens" "t"
        LEFT JOIN "token_sets_tokens" "tst"
          ON "t"."contract" = "tst"."contract"
          AND "t"."token_id" = "tst"."token_id"
        LEFT JOIN "orders" "o"
          ON "tst"."token_set_id" = "o"."token_set_id"
          AND "o"."side" = 'sell'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
        WHERE "t"."contract" = $/contract/
        AND "t".token_id = $/tokenId/
        ORDER BY "t"."contract", "t"."token_id", "o"."value", "o"."fee_bps"
      ) "x"
      WHERE "t"."contract" = "x"."contract"
        AND "t"."token_id" = "x"."token_id"
        AND "t"."floor_sell_id" IS DISTINCT FROM "x"."id"
    `;

    await idb.none(query, values);
  }

  public static async recalculateTokenTopBuy(contract: string, tokenId: string) {
    const values = {
      contract: toBuffer(contract),
      tokenId,
    };

    const query = `
      UPDATE "tokens" "t" SET
        "top_buy_id" = "x"."id",
        "top_buy_value" = "x"."value",
        "top_buy_maker" = "x"."maker"
      FROM (
        SELECT DISTINCT ON ("t"."contract", "t"."token_id")
          "t"."contract",
          "t"."token_id",
          "o"."id",
          "o"."value",
          "o"."maker"
        FROM "tokens" "t"
        LEFT JOIN "token_sets_tokens" "tst"
          ON "t"."contract" = "tst"."contract"
          AND "t"."token_id" = "tst"."token_id"
        LEFT JOIN "orders" "o"
          ON "tst"."token_set_id" = "o"."token_set_id"
          AND "o"."side" = 'buy'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
          AND EXISTS(
            SELECT FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."owner" != "o"."maker"
              AND "nb"."amount" > 0
          )
        WHERE "t"."contract" = $/contract/
        AND "t".token_id = $/tokenId/
        ORDER BY "t"."contract", "t"."token_id", "o"."value" DESC NULLS LAST
      ) "x"
      WHERE "t"."contract" = "x"."contract"
        AND "t"."token_id" = "x"."token_id"
        AND "t"."top_buy_id" IS DISTINCT FROM "x"."id"
    `;

    await idb.none(query, values);
  }
}
