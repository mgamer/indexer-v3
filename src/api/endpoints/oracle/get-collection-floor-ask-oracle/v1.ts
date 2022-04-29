/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, formatEth } from "@/common/utils";

const version = "v1";

export const getCollectionFloorAskOracleV1Options: RouteOptions = {
  description:
    "Get a standardized 'TrustUs' signature of any collection's floor price (spot or twap)",
  tags: ["api", "2. Aggregator"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      kind: Joi.string().valid("spot", "twap", "lower", "upper").default("spot"),
    }),
  },
  response: {
    schema: Joi.object({
      price: Joi.number().unsafe().required(),
    }).label(`getCollectionFloorAskOracle${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-floor-ask-oracle-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    const params = request.params as any;

    try {
      const spotQuery = `
        SELECT
          collection_floor_sell_events.price
        FROM collection_floor_sell_events
        WHERE collection_floor_sell_events.collection_id = $/collection/
        ORDER BY collection_floor_sell_events.created_at DESC
        LIMIT 1
      `;

      const twapQuery = `
        WITH
          x AS (
            SELECT
              *
            FROM collection_floor_sell_events
            WHERE collection_floor_sell_events.collection_id = $/collection/
              AND collection_floor_sell_events.created_at >= now() - interval '24 hours'
            ORDER BY collection_floor_sell_events.created_at
          ),
          y AS (
            SELECT
              *
            FROM collection_floor_sell_events
            WHERE collection_floor_sell_events.collection_id = $/collection/
              AND collection_floor_sell_events.created_at < (SELECT MIN(x.created_at) FROM x)
            ORDER BY collection_floor_sell_events.created_at
            LIMIT 1
          ),
          z AS (
            SELECT * FROM x
            UNION ALL
            SELECT * FROM y
          ),
          w AS (
            SELECT
              price,
              floor(extract('epoch' FROM greatest(z.created_at, now() - interval '24 hours'))) AS start_time,
              floor(extract('epoch' FROM coalesce(lead(z.created_at, 1) OVER (ORDER BY created_at), now()))) AS end_time
            FROM z
          )
          SELECT
            SUM(
              w.price * (w.end_time - w.start_time)::NUMERIC) / ((MAX(w.end_time) - MIN(w.start_time))::NUMERIC
            ) AS price
          FROM w
      `;

      let price: string;
      if (query.kind === "spot") {
        const result = await edb.oneOrNone(spotQuery, params);
        if (!result?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        price = result.price;
      } else if (query.kind === "twap") {
        const result = await edb.oneOrNone(twapQuery, params);
        if (!result?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        price = result.price;
      } else {
        const spotResult = await edb.oneOrNone(spotQuery, params);
        const twapResult = await edb.oneOrNone(twapQuery, params);
        if (!spotResult?.price || !twapResult?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        if (query.kind === "lower") {
          price = bn(spotResult.price).lt(twapResult.price) ? spotResult.price : twapResult.price;
        } else {
          price = bn(spotResult.price).gt(twapResult.price) ? spotResult.price : twapResult.price;
        }
      }

      return {
        price: formatEth(price),
      };
    } catch (error) {
      logger.error(
        `get-collection-floor-ask-oracle-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
