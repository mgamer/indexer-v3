/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { idb } from "@/common/db";

const main = async () => {
  const limit = 2000;
  let result;
  const collections = [
    "0x0a1bbd57033f57e7b6743621b79fcb9eb2ce3676",
    "0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a",
  ];

  for (const collection of collections) {
    // Update the activities
    const updateActivitiesQuery = `
      WITH x AS (
        SELECT id
        FROM activities
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      UPDATE activities
      SET collection_id = (
        SELECT collection_id
        FROM tokens
        WHERE contract = activities.contract
        AND token_id = activities.token_id
      )
      FROM x
      WHERE id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(updateActivitiesQuery, { collection });
    } while (result.length == limit);
    console.log(`activities updated for ${collection}`);

    // Update the user activities
    const updateUserActivitiesQuery = `
      WITH x AS (
        SELECT id
        FROM user_activities
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      UPDATE activities
      SET collection_id = (
        SELECT collection_id
        FROM tokens
        WHERE contract = user_activities.contract
        AND token_id = user_activities.token_id
      )
      FROM x
      WHERE id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(updateUserActivitiesQuery, { collection });
    } while (result.length == limit);
    console.log(`user_activities updated for ${collection}`);

    // Clean the attributes
    const cleanAttributesQuery = `
      WITH x AS (
        SELECT id
        FROM attributes
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      DELETE FROM attributes
      FROM x
      WHERE id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(cleanAttributesQuery, { collection });
    } while (result.length == limit);
    console.log(`attributes updated for ${collection}`);

    // Clean the attribute keys
    const cleanAttributeKeysQuery = `
      WITH x AS (
        SELECT id
        FROM attribute_keys
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      DELETE FROM attribute_keys
      FROM x
      WHERE id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(cleanAttributeKeysQuery, { collection });
    } while (result.length == limit);
    console.log(`attribute_keys updated for ${collection}`);

    // Clean the attribute keys
    const cleanTokenSetsQuery = `
      WITH x AS (
        SELECT id
        FROM token_sets
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      DELETE FROM token_sets
      FROM x
      WHERE id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(cleanTokenSetsQuery, { collection });
    } while (result.length == limit);
    console.log(`token_sets updated for ${collection}`);

    // // Clean the collection
    // const cleanCollectionsQuery = `
    //   DELETE FROM collections
    //   WHERE id = $/collection/
    // `;
    //
    // await idb.none(cleanCollectionsQuery, { collection });
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
