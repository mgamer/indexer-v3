import { keccak256 } from "@ethersproject/solidity";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/wyvern-v2/builders/token-list/utils";
import crypto from "crypto";
import stringify from "json-stable-stringify";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

export type TokenSet = {
  id: string;
  schemaHash: Buffer;
  schema?: any;
  contract: string;
  tokenIds: string[];
};

const isValid = (tokenSet: TokenSet) => {
  try {
    // Verify that the token set id matches the underlying tokens
    const merkleTree = generateMerkleTree(tokenSet.tokenIds);
    const merkleRoot = keccak256(
      ["address", "bytes32"],
      [tokenSet.contract, merkleTree.getHexRoot()]
    );
    if (tokenSet.id !== `list:${tokenSet.contract}:${merkleRoot}`) {
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

    const { id, schemaHash, schema, contract, tokenIds } = tokenSet;
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

      // For efficiency, skip if data already exists
      const tokenSetTokensExist = await db.oneOrNone(
        `
          SELECT 1 FROM "token_sets_tokens" "tst"
          WHERE "tst"."token_set_id" = $/tokenSetId/
          LIMIT 1
        `,
        { tokenSetId: id }
      );
      if (!tokenSetTokensExist) {
        const columns = new pgp.helpers.ColumnSet(
          ["token_set_id", "contract", "token_id"],
          { table: "token_sets_tokens" }
        );
        const values = tokenIds.map((tokenId) => ({
          token_set_id: id,
          contract: toBuffer(contract),
          token_id: tokenId,
        }));

        queries.push({
          query: `
            INSERT INTO "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            ) VALUES ${pgp.helpers.values(values, columns)}
            ON CONFLICT DO NOTHING
          `,
        });
      }

      valid.push(tokenSet);
    } catch (error) {
      logger.error(
        "orderbook-token-list-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }

  return valid;
};
