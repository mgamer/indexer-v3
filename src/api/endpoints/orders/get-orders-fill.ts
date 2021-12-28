import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as queries from "@/entities/orders/get-best-order";

export const getOrdersFillOptions: RouteOptions = {
  description: "Get fill order",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      // TODO: Integrate attributes once attribute-based orders are supported
      side: Joi.string().lowercase().valid("sell", "buy").default("sell"),
    })
      // TODO: Only the following combinations should be allowed:
      // - contract + tokenId
      // - collection
      // - collection + attributes
      .or("contract", "collection")
      .oxor("contract", "collection"),
  },
  response: {
    schema: Joi.object({
      order: Joi.object({
        chainId: Joi.number(),
        // TODO: When time comes, add support for other order formats
        // apart from WyvernV2 which is the only one supported for now
        params: wyvernV2OrderFormat,
      }).allow(null),
    }).label("getOrdersFillResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_orders_fill_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const bestOrder = await queries.getBestOrder(
        query as queries.GetBestOrderFilter
      );

      return {
        order: bestOrder
          ? new Sdk.WyvernV2.Order(config.chainId, bestOrder.rawData)
          : null,
      };
    } catch (error) {
      logger.error("get_orders_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
