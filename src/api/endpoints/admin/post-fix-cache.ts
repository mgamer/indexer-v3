/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { toBuffer } from "@/common/utils";

export const postFixCacheOptions: RouteOptions = {
  description: "Trigger fixing any cache inconsistencies.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      kind: Joi.string().valid("tokens-floor-sell", "tokens-top-buy").required(),
      contracts: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-f0-9]{40}$/)
          .required()
      ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const kind = payload.kind;
      const contracts = payload.contracts;

      const queries: PgPromiseQuery[] = [];
      switch (kind) {
        case "tokens-floor-sell": {
          for (const contract of contracts) {
            queries.push({
              query: `
                UPDATE "tokens" "t" SET
                  "floor_sell_id" = "x"."id",
                  "floor_sell_value" = "x"."value",
                  "floor_sell_maker" = "x"."maker"
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
                    AND "o"."side" = 'sell'
                    AND "o"."fillability_status" = 'fillable'
                    AND "o"."approval_status" = 'approved'
                  WHERE "t"."contract" = $/contract/
                  ORDER BY "t"."contract", "t"."token_id", "o"."value", "o"."fee_bps"
                ) "x"
                WHERE "t"."contract" = "x"."contract"
                  AND "t"."token_id" = "x"."token_id"
                  AND "t"."floor_sell_id" IS DISTINCT FROM "x"."id"
              `,
              values: {
                contract: toBuffer(contract),
              },
            });
          }

          break;
        }

        case "tokens-top-buy": {
          for (const contract of contracts) {
            queries.push({
              query: `
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
              `,
              values: {
                contract: toBuffer(contract),
              },
            });
          }

          break;
        }
      }

      if (queries.length) {
        await idb.none(pgp.helpers.concat(queries));
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-cache-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
