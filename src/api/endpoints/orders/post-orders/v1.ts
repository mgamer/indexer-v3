import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as wyvernV23 from "@/orderbook/orders/wyvern-v2.3";

const version = "v1";

export const postOrdersV1Options: RouteOptions = {
  description: "Post new orders.",
  tags: ["api", "orders"],
  validate: {
    payload: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          kind: Joi.string().lowercase().valid("wyvern-v2.3").required(),
          data: Joi.any().required(),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const orders = payload.orders;

      const wyvernV23OrderInfos: wyvernV23.OrderInfo[] = [];
      for (const { kind, data } of orders) {
        switch (kind) {
          case "wyvern-v2.3": {
            wyvernV23OrderInfos.push({
              orderParams: data,
              metadata: {},
            });

            break;
          }
        }
      }

      await orderbookOrders.addToQueue(
        wyvernV23OrderInfos.map((orderInfo) => ({
          kind: "wyvern-v2.3",
          info: orderInfo,
        }))
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(
        `post-orders-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
