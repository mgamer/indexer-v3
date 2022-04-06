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
    const query = `SELECT attribute_id AS "attributeId", key, token_attributes.value, attribute_key_id AS "attributeKeyId"
                   FROM token_attributes
                   JOIN attributes ON token_attributes.attribute_id = attributes.id
                   WHERE contract = $/contract/
                   AND token_id = $/tokenId/`;

    logger.info(
      "update-attribute-queue",
      PgPromise.as.format(query, {
        contract: toBuffer(contract),
        tokenId,
      })
    );

    return (await idb.manyOrNone(query, {
      contract: toBuffer(contract),
      tokenId,
    })) as TokenAttributes[];
  }
}
