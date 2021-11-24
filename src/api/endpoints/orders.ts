import { Order } from "@georgeroman/wyvern-v2-sdk";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

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
  },
};
