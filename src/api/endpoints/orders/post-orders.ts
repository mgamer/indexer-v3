import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as wyvernV2 from "@/orders/wyvern-v2";

export const postOrdersOptions: RouteOptions = {
  description: "Post new orders",
  tags: ["api"],
  validate: {
    payload: Joi.object().keys({
      orders: Joi.array().items(
        Joi.object().keys({
          kind: Joi.string().lowercase().valid("wyvern-v2").required(),
          data: Joi.object().when("kind", {
            is: Joi.equal("wyvern-v2"),
            then: wyvernV2OrderFormat,
          }),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    if (!config.acceptOrders) {
      throw Boom.unauthorized("Not accepting orders");
    }

    try {
      const orders = payload.orders as any;

      const validOrders: Sdk.WyvernV2.Order[] = [];
      for (const { kind, data } of orders) {
        if (kind === "wyvern-v2") {
          try {
            const order = new Sdk.WyvernV2.Order(config.chainId, data);
            validOrders.push(order);
          } catch {
            // Skip any invalid orders
          }
        }
      }

      const filterResults = await wyvernV2.filterOrders(validOrders);
      const saveResults = await wyvernV2.saveOrders(filterResults.validOrders);

      const result: { [hash: string]: string } = {};
      for (const { order, reason } of filterResults.invalidOrders) {
        result[order.prefixHash()] = reason;
      }
      for (const { order, reason } of saveResults.invalidOrders) {
        result[order.prefixHash()] = reason;
      }
      for (const order of saveResults.validOrders) {
        result[order.prefixHash()] = "Success";
      }

      return { result };
    } catch (error) {
      logger.error("post_orders_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
