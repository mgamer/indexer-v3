/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { TokensEntity, TokensEntityParams, TokensEntityUpdateParams } from "./tokens-entity";
import _ from "lodash";

export class Tokens {
  public static async getByContractAndTokenId(contract: string, tokenId: number) {
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

  public static async update(contract: string, tokenId: number, fields: TokensEntityUpdateParams) {
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
}
