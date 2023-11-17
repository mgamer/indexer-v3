import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { idb, ridb } from "@/common/db";
import { regex, toBuffer } from "@/common/utils";
import { Collections } from "@/models/collections";
import _ from "lodash";

export const postResyncUserCollectionBalance: RouteOptions = {
  description: "Trigger the recalculation of user in certain collection",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      user: Joi.string().lowercase().required(),
      collection: Joi.string().lowercase().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;
    let message = `No balance detected for user ${payload.user} in collection ${payload.collection}`;
    let newBalanceResults;

    try {
      // If a non shared contract
      if (payload.collection.match(regex.address)) {
        // Calc the user balance
        const query = `
          SELECT owner, SUM(amount) AS "amount"
          FROM nft_balances
          WHERE owner = $/owner/
          AND contract = $/contract/
          AND amount > 0
          GROUP BY owner
        `;

        newBalanceResults = await ridb.oneOrNone(query, {
          owner: toBuffer(payload.user),
          contract: toBuffer(payload.collection),
        });
      } else if (payload.collection.match(/^0x[a-fA-F0-9]{40}:\d+:\d+$/)) {
        const collection = await Collections.getById(payload.collection);

        if (collection && !_.isEmpty(collection.tokenIdRange)) {
          const query = `            
            SELECT owner, SUM(amount) AS "amount"
            FROM nft_balances
            WHERE owner = $/owner/
            AND contract = $/contract/
            AND token_id <@ $/tokenIdRange:raw/
            AND amount > 0
            GROUP BY owner
          `;

          newBalanceResults = await ridb.oneOrNone(query, {
            owner: toBuffer(payload.user),
            contract: toBuffer(collection.contract),
            tokenIdRange: `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`,
          });
        }
      }

      if (newBalanceResults) {
        await idb.none(
          `
            UPDATE user_collections
            SET token_count = $/amount/
            WHERE owner = $/user/
            AND collection_id = $/collection/
          `,
          {
            owner: toBuffer(payload.user),
            collection: payload.collection,
            amount: newBalanceResults.amount,
          }
        );

        message = `New balance ${newBalanceResults.amount} for user ${payload.user} in collection ${payload.collection}`;
      }

      return { message };
    } catch (error) {
      logger.error("post-resync-user-collection-balance", `Handler failure: ${error}`);
      throw error;
    }
  },
};
