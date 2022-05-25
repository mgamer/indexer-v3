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

  public static async getByTokenSetId(tokenSetId: string) {
    const collection: CollectionsEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM collections
              WHERE token_set_id = $/tokenSetId/`,
      {
        tokenSetId,
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

  public static async recalculateContractFloorSell(contract: string) {
    const values = {
      contract: toBuffer(contract),
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
        ORDER BY "t"."contract", "t"."token_id", "o"."value", "o"."fee_bps"
      ) "x"
      WHERE "t"."contract" = "x"."contract"
        AND "t"."token_id" = "x"."token_id"
        AND "t"."floor_sell_id" IS DISTINCT FROM "x"."id"
    `;

    await idb.none(query, values);
  }

  public static async recalculateContractTopBuy(contract: string) {
    const values = {
      contract: toBuffer(contract),
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
        ORDER BY "t"."contract", "t"."token_id", "o"."value" DESC NULLS LAST
      ) "x"
      WHERE "t"."contract" = "x"."contract"
        AND "t"."token_id" = "x"."token_id"
        AND "t"."top_buy_id" IS DISTINCT FROM "x"."id"
    `;

    await idb.none(query, values);
  }
}
