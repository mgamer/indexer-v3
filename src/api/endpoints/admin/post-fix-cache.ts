import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const postFixCacheOptions: RouteOptions = {
  description: "Trigger fixing any cache inconsistencies",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      kind: Joi.string().valid("tokens-floor-sell", "tokens-top-buy"),
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
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const kind = payload.kind;

      let contracts = payload.contracts;
      if (!contracts) {
        const contractsData = require(`@/config/data/${config.chainId}/contracts.json`);
        contracts = [...contractsData["erc721"], ...contractsData["erc1155"]];
      }

      switch (kind) {
        case "tokens-floor-sell": {
          for (const contract of contracts) {
            await db.none(
              `
                update "tokens" "t" set
                  "floor_sell_hash" = "x"."hash",
                  "floor_sell_value" = "x"."value"
                from (
                  select distinct on ("t"."contract", "t"."token_id")
                    "t"."contract",
                    "t"."token_id",
                    "o"."value",
                    "o"."hash"
                  from "tokens" "t"
                  left join "token_sets_tokens" "tst"
                    on "t"."contract" = "tst"."contract"
                    and "t"."token_id" = "tst"."token_id"
                  left join "orders" "o"
                    on "tst"."token_set_id" = "o"."token_set_id"
                    and "o"."side" = 'sell'
                    and "o"."status" = 'valid'
                  where "t"."contract" = $/contract/
                  order by "t"."contract", "t"."token_id", "o"."value" asc nulls last
                ) "x"
                where "t"."contract" = "x"."contract"
                  and "t"."token_id" = "x"."token_id"
              `,
              { contract }
            );
          }

          break;
        }

        case "tokens-top-buy": {
          for (const contract of contracts) {
            await db.none(
              `
                update "tokens" "t" set
                  "top_buy_hash" = "x"."hash",
                  "top_buy_value" = "x"."value"
                from (
                  select distinct on ("t"."contract", "t"."token_id")
                    "t"."contract",
                    "t"."token_id",
                    "o"."value",
                    "o"."hash"
                  from "tokens" "t"
                  left join "token_sets_tokens" "tst"
                    on "t"."contract" = "tst"."contract"
                    and "t"."token_id" = "tst"."token_id"
                  left join "orders" "o"
                    on "tst"."token_set_id" = "o"."token_set_id"
                    and "o"."side" = 'buy'
                    and "o"."status" = 'valid'
                  where "t"."contract" = $/contract/
                  order by "t"."contract", "t"."token_id", "o"."value" desc nulls last
                ) "x"
                where "t"."contract" = "x"."contract"
                  and "t"."token_id" = "x"."token_id"
              `,
              { contract }
            );
          }

          break;
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post_fix_cache_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
