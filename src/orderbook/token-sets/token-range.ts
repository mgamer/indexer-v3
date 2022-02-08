import crypto from "crypto";
import stringify from "json-stable-stringify";

import { db, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type TokenSet = {
  id: string;
  schemaHash: Buffer;
  schema?: any;
  contract: string;
  startTokenId: string;
  endTokenId: string;
};

const isValid = (tokenSet: TokenSet) => {
  try {
    if (
      tokenSet.id !==
      `range:${tokenSet.contract}:${tokenSet.startTokenId}:${tokenSet.endTokenId}`
    ) {
      return false;
    }

    if (tokenSet.schema) {
      // If we have the schema, then validate it against the schema hash
      const schemaHash = crypto
        .createHash("sha256")
        .update(stringify(tokenSet.schema))
        .digest();
      if (!schemaHash.equals(tokenSet.schemaHash)) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
};

export const save = async (tokenSets: TokenSet[]): Promise<TokenSet[]> => {
  const queries: any[] = [];

  const valid: TokenSet[] = [];
  for (const tokenSet of tokenSets) {
    if (!isValid(tokenSet)) {
      continue;
    }

    const { id, schemaHash, schema, contract, startTokenId, endTokenId } =
      tokenSet;
    try {
      queries.push({
        query: `
          INSERT INTO "token_sets" (
            "id",
            "schema_hash",
            "schema"
          ) VALUES (
            $/id/,
            $/schemaHash/,
            $/schema:json/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash,
          schema,
        },
      });

      // For efficiency, directly skip if data already exists
      const tokenSetTokensExist = await db.one(
        `
          SELECT 1 FROM "token_sets_tokens" "tst"
          WHERE "tst"."token_set_id" = $/tokenSetId/
        `,
        { tokenSetId: id }
      );
      if (!tokenSetTokensExist) {
        queries.push({
          query: `
            INSERT INTO "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            ) (
              SELECT
                $/tokenSetId/,
                $/contract/,
                "t"."token_id""
              FROM "tokens" "t"
              WHERE "t"."contract" = $/contract/
                AND "t"."token_id" >= $/startTokenId/
                AND "t"."token_id" <= $/endTokenId/
            )
            ON CONFLICT DO NOTHING
          `,
          values: {
            tokenSetId: tokenSet.id,
            contract: toBuffer(contract),
            startTokenId,
            endTokenId,
          },
        });
      }

      valid.push(tokenSet);
    } catch {
      // Ignore any invalid token sets
    }
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }

  return valid;
};
