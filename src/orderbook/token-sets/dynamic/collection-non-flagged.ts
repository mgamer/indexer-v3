import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet, TokenSetSchema } from "@/orderbook/token-sets/utils";

export type Metadata = {
  collection: string;
};

const getTokenSet = (metadata: Metadata): TokenSet => {
  // Generate schema
  const schema: TokenSetSchema = {
    kind: "collection-non-flagged",
    data: {
      collection: metadata.collection,
    },
  };

  // Generate token set
  const tokenSet: TokenSet = {
    id: `dynamic:collection-non-flagged:${metadata.collection}`,
    schemaHash: generateSchemaHash(schema),
    schema,
  };

  return tokenSet;
};

export const save = async (metadata: Metadata): Promise<TokenSet | undefined> => {
  const tokenSet = getTokenSet(metadata);

  // If the token set already exists, we can simply skip any other further actions
  const tokenSetExists = await idb.oneOrNone(
    `
      SELECT 1 FROM token_sets_tokens
      WHERE token_sets_tokens.token_set_id = $/id/
      LIMIT 1
    `,
    {
      id: tokenSet.id,
    }
  );
  if (tokenSetExists) {
    return tokenSet;
  }

  const queries: PgPromiseQuery[] = [];

  // Insert into the `token_sets` table
  queries.push({
    query: `
      INSERT INTO token_sets (
        id,
        schema_hash,
        schema,
        collection_id
      ) VALUES (
        $/id/,
        $/schemaHash/,
        $/schema:json/,
        $/collection/,
      )
      ON CONFLICT DO NOTHING
    `,
    values: {
      id: tokenSet.id,
      schemaHash: toBuffer(tokenSet.schemaHash),
      schema: tokenSet.schema,
      collection: tokenSet.schema.data.collection,
    },
  });

  try {
    // Fetch the collection's contract
    const contract = await idb
      .oneOrNone(
        `
          SELECT
            collections.contract
          FROM collections
          WHERE collections.id = $/collection/
        `,
        {
          collection: tokenSet.schema.data.collection,
        }
      )
      .then((result) => fromBuffer(result.contract));

    // Fetch all non-flagged tokens from the collection
    const items = await idb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.collection_id = $/collection/
          AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)
      `,
      {
        collection: tokenSet.schema.data.collection,
      }
    );

    // Insert into the `token_sets_tokens` table
    const columns = new pgp.helpers.ColumnSet(["token_set_id", "contract", "token_id"], {
      table: "token_sets_tokens",
    });
    const values = items.map(({ token_id }) => ({
      token_set_id: tokenSet.id,
      contract: toBuffer(contract),
      token_id,
    }));
    queries.push({
      query: `
        INSERT INTO token_sets_tokens (
          token_set_id,
          contract,
          token_id
        ) VALUES ${pgp.helpers.values(values, columns)}
        ON CONFLICT DO NOTHING
      `,
    });

    if (queries.length) {
      await idb.none(pgp.helpers.concat(queries));
    }
  } catch (error) {
    logger.error(
      "token-sets",
      JSON.stringify({
        kind: "dynamic-collection-non-flagged",
        error,
        tokenSet,
      })
    );
    return undefined;
  }

  return tokenSet;
};

export const update = async (
  metadata: Metadata,
  token: { contract: string; tokenId: string },
  updateKind: "add" | "remove"
) => {
  const tokenSet = getTokenSet(metadata);
  updateKind === "add"
    ? idb.none(
        `
          INSERT INTO token_sets_tokens (
            token_set_id,
            contract,
            token_id
          ) VALUES (
            $/id/,
            $/contract/,
            $/tokenId/
          )
        `,
        {
          id: tokenSet.id,
          contract: toBuffer(token.contract),
          tokenId: token.tokenId,
        }
      )
    : idb.none(
        `
          DELETE FROM token_sets_tokens
          WHERE token_set_id = $/id/
            AND contract = $/contract/
            AND token_id = $/tokenId/
        `,
        {
          id: tokenSet.id,
          contract: toBuffer(token.contract),
          tokenId: token.tokenId,
        }
      );
};
