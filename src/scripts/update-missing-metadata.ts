/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-constant-condition */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import _ from "lodash";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { PendingRefreshTokens, RefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingRefreshTokensBySlug } from "@/models/pending-refresh-tokens-by-slug";
import { getIndexingMethod } from "@/jobs/metadata-index/fetch-queue";

const limit = 100;
async function processCollection(collection: {
  contract: Buffer;
  id: string;
  community: string;
  slug: string;
}) {
  let lastTokenId = "";
  const unindexedTokens: RefreshTokens[] = [];
  let indexedTokensCount = 0;

  while (true) {
    let idAndContractFilter = "";
    if (lastTokenId != "") {
      console.log(`Collection contract ${collection.contract}, lastTokenId = ${lastTokenId}`);
      idAndContractFilter = `WHERE collection_id = '${collection.id}' AND (t.contract, t.token_id) > ('${collection.contract}','${lastTokenId}')`;
    }

    const query = `
      SELECT token_id, metadata_indexed, image
      FROM tokens t ${idAndContractFilter}
      ORDER BY t.contract ASC, t.token_id ASC
      LIMIT ${limit}
    `;

    const tokens = await redb.manyOrNone(query);
    _.map(tokens, (token) => {
      if (token.metadata_indexed && token.image) {
        indexedTokensCount++;
      } else {
        unindexedTokens.push({
          collection: collection.id,
          contract: fromBuffer(collection.contract),
          tokenId: token.token_id,
        } as RefreshTokens);
      }
    });

    if (_.size(tokens) < limit) {
      break;
    } else {
      lastTokenId = _.last(tokens).token_id;
    }
  }

  const indexingMethod = getIndexingMethod(collection.community);
  if (unindexedTokens.length / indexedTokensCount > 0.15) {
    // push to collection refresh queue
    const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug(indexingMethod);
    await pendingRefreshTokensBySlug.add({
      slug: collection.slug,
      contract: fromBuffer(collection.contract),
    });
  } else {
    // push to tokens refresh queue
    const pendingRefreshTokens = new PendingRefreshTokens(indexingMethod);
    await pendingRefreshTokens.add(unindexedTokens);
  }
}

const main = async () => {
  let lastId = "";

  while (true) {
    let idFilter = "";
    if (lastId != "") {
      console.log(`lastId = ${lastId}`);
      idFilter = `WHERE id > '${lastId}'`;
    }

    const query = `
      SELECT id, contract, community, slug
      FROM collections
      ${idFilter}
      ORDER BY id ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    await Promise.all(
      _.map(collections, (collection) =>
        processCollection({
          contract: collection.contract,
          id: collection.id,
          community: collection.community,
          slug: collection.slug,
        })
      )
    );

    if (_.size(collections) < limit) {
      break;
    } else {
      lastId = _.last(collections).id;
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
