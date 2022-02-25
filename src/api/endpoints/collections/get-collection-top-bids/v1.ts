import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";

const version = "v1";

export const getCollectionTopBidsV1Options: RouteOptions = {
  description:
    "Get the top bids for a single collection (and optionally an attribute).",
  tags: ["api", "collections"],
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
  },
  response: {
    schema: Joi.object({
      topBids: Joi.array().items(
        Joi.object({
          value: Joi.number().unsafe(),
          quantity: Joi.number(),
        })
      ),
    }).label(`getCollectionTopBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-top-bids-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      let baseQuery = `
        SELECT
          "t"."top_buy_value" AS "value",
          COUNT(*) AS "quantity"
        FROM "tokens" "t"
        WHERE "t"."collection_id" = $/collection/
          AND "t"."top_buy_value" IS NOT NULL
        GROUP BY "t"."top_buy_value"
        ORDER BY "t"."top_buy_value" DESC NULLS LAST
      `;

      const result = await db.manyOrNone(baseQuery, params).then((result) =>
        result.map((r) => ({
          value: formatEth(r.value),
          quantity: Number(r.quantity),
        }))
      );

      return { topBids: result };
    } catch (error) {
      logger.error(
        `get-collection-top-bids-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
