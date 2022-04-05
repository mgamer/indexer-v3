/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";

const version = "v1";

export const postOrdersV1Options: RouteOptions = {
  description: "Publish multiple orders in bulk",
  tags: ["api", "1. Order Book"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    payload: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          kind: Joi.string().lowercase().valid("looks-rare", "opendao", "wyvern-v2.3").required(),
          data: Joi.object().required(),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const orders = payload.orders;

      logger.info(`post-orders-${version}-handler`, `Got ${orders.length} orders`);

      const orderInfos: orderbookOrders.GenericOrderInfo[] = [];
      for (const { kind, data } of orders) {
        orderInfos.push({
          kind,
          info: {
            orderParams: data,
            metadata: {},
          },
          relayToArweave: true,
        });
      }

      await orderbookOrders.addToQueue(orderInfos);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-orders-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
