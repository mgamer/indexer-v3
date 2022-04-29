/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultAbiCoder } from "@ethersproject/abi";
import { splitSignature } from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/solidity";
import { Wallet } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, formatEth } from "@/common/utils";
import { config } from "@/config/index";

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
      contractName: Joi.string().required(),
      contractVersion: Joi.number().integer().positive().required(),
      verifyingContract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      kind: Joi.string().valid("spot", "twap", "lower", "upper").default("spot"),
    }),
  },
  response: {
    schema: Joi.object({
      price: Joi.number().unsafe().required(),
      packet: Joi.object({
        request: Joi.string().required(),
        deadline: Joi.number().required(),
        payload: Joi.string().required(),
        v: Joi.number(),
        r: Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{64}$/),
        s: Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{64}$/),
      }),
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

      let request: string;
      if (params.collection.includes(":")) {
        const [contract, startTokenId, endTokenId] = params.collection.split(":");
        request = keccak256(
          ["string", "string", "address", "uint256", "uint256"],
          [query.kind, "range", contract, startTokenId, endTokenId]
        );
      } else {
        request = keccak256(
          ["string", "string", "address"],
          [query.kind, "contract", params.collection]
        );
      }

      // "TrustUs" packet
      const packet: {
        request: string;
        deadline: number;
        payload: string;
        v?: number;
        r?: string;
        s?: string;
      } = {
        request,
        deadline: Math.floor(Date.now() / 1000) + 5 * 60,
        payload: defaultAbiCoder.encode(["uint256"], [price]),
      };

      if (config.oraclePrivateKey) {
        const wallet = new Wallet(config.oraclePrivateKey);

        const { v, r, s } = splitSignature(
          await wallet._signTypedData(
            {
              name: query.contractName,
              version: query.contractVersion,
              chainId: config.chainId,
              verifyingContract: query.verifyingContract,
            },
            {
              VerifyPacket: [
                { name: "request", type: "bytes32" },
                { name: "deadline", type: "uint256" },
                { name: "payload", type: "bytes" },
              ],
            },
            packet
          )
        );
        packet.v = v;
        packet.r = r;
        packet.s = s;
      }

      return {
        price: formatEth(price),
        packet,
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
