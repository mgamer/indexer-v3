import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-orders";

export const getOrdersOptions: RouteOptions = {
  description:
    "Get a list of orders. Useful for showing users their currently active or expired orders.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributeKey: Joi.string(),
      attributeValue: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      hash: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{64}$/),
      includeInvalid: Joi.bool(),
      side: Joi.string().lowercase().valid("sell", "buy"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .or("contract", "collection", "maker", "hash")
      .oxor("contract", "collection", "hash")
      .with("contract", "tokenId")
      .with("attributeKey", ["collection", "attributeValue"]),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          hash: Joi.string(),
          status: Joi.string(),
          tokenSetId: Joi.string(),
          schema: Joi.object({
            data: Joi.object().unknown(),
            kind: Joi.string(),
          }),
          metadata: Joi.object({
            collectionName: Joi.string().allow(null, ""),
            tokenName: Joi.string().allow(null, ""),
          }).allow(null),
          kind: Joi.string(),
          side: Joi.string(),
          maker: Joi.string(),
          price: Joi.number().unsafe(),
          value: Joi.number().unsafe(),
          validFrom: Joi.number(),
          validUntil: Joi.number(),
          sourceInfo: Joi.object({
            id: Joi.string(),
            bps: Joi.number(),
          }),
          royaltyInfo: Joi.array()
            .items(Joi.object({ recipient: Joi.string(), bps: Joi.number() }))
            .allow(null),
          rawData: Joi.object().when("kind", {
            is: Joi.equal("wyvern-v2"),
            then: wyvernV2OrderFormat,
          }),
        })
      ),
    }).label("getOrdersResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_orders_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const orders = await queries.getOrders(query as queries.GetOrdersFilter);
      return { orders };
    } catch (error) {
      logger.error("get_orders_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
