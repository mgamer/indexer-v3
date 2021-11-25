import { Order } from "@georgeroman/wyvern-v2-sdk";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { GetOrdersFilter, getOrders } from "@/entities/orders";
import { filterOrders, parseApiOrder, saveOrders } from "@/orders/wyvern-v2";

export const postOrdersOptions: RouteOptions = {
  description: "Post new orders",
  tags: ["api"],
  validate: {
    payload: Joi.object().keys({
      orders: Joi.array().items(
        Joi.object().keys({
          exchange: Joi.string().required(),
          maker: Joi.string().required(),
          taker: Joi.string().required(),
          makerRelayerFee: Joi.string().required(),
          takerRelayerFee: Joi.string().required(),
          feeRecipient: Joi.string().required(),
          side: Joi.number().valid(0, 1).required(),
          saleKind: Joi.number().valid(0, 1).required(),
          target: Joi.string().required(),
          howToCall: Joi.number().valid(0, 1).required(),
          calldata: Joi.string().required(),
          replacementPattern: Joi.string().required(),
          staticTarget: Joi.string().required(),
          staticExtradata: Joi.string().required(),
          paymentToken: Joi.string().required(),
          basePrice: Joi.string().required(),
          extra: Joi.string().required(),
          listingTime: Joi.string().required(),
          expirationTime: Joi.string().required(),
          salt: Joi.string().required(),
          v: Joi.number().required(),
          r: Joi.string().required(),
          s: Joi.string().required(),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const orders = payload.orders as any;

      const parsedOrders: Order[] = [];
      for (const order of orders) {
        const parsedOrder = parseApiOrder(order);
        if (parsedOrder) {
          parsedOrders.push(parsedOrder);
        }
      }

      if (parsedOrders.length < orders.length) {
        throw Boom.badRequest("One or more orders are invalid");
      }

      const filteredOrders = await filterOrders(parsedOrders);
      if (filteredOrders.length < orders.length) {
        throw Boom.badData("One or more orders are invalid");
      }
      await saveOrders(filteredOrders);

      return { message: "Success" };
    } catch (error) {
      logger.error("post_orders_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

export const getOrdersOptions: RouteOptions = {
  description: "Get orders",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      maker: Joi.string().lowercase(),
      side: Joi.string().lowercase().valid("sell", "buy").required(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).or("contract", "maker"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const orders = await getOrders(query as GetOrdersFilter);

      return { orders };
    } catch (error) {
      logger.error("get_orders_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
