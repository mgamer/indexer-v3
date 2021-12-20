import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as queries from "@/entities/orders";
import * as wyvernV2 from "@/orders/wyvern-v2";

export const postOrdersOptions: RouteOptions = {
  description: "Post orders",
  tags: ["api"],
  validate: {
    payload: Joi.object().keys({
      orders: Joi.array().items(
        Joi.object().keys({
          kind: Joi.string().lowercase().valid("wyvern-v2").required(),
          data: Joi.object().when("kind", {
            is: Joi.equal("wyvern-v2"),
            then: Joi.object({
              exchange: Joi.string().required(),
              maker: Joi.string().required(),
              taker: Joi.string().required(),
              makerRelayerFee: Joi.alternatives(
                Joi.number(),
                Joi.string()
              ).required(),
              takerRelayerFee: Joi.alternatives(
                Joi.number(),
                Joi.string()
              ).required(),
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
              listingTime: Joi.alternatives(
                Joi.number(),
                Joi.string()
              ).required(),
              expirationTime: Joi.alternatives(
                Joi.number(),
                Joi.string()
              ).required(),
              salt: Joi.string().required(),
              v: Joi.number().required(),
              r: Joi.string().required(),
              s: Joi.string().required(),
            }).options({ allowUnknown: true }),
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

      console.log(`Got payload ${JSON.stringify(orders)}`);

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

      const filteredOrders = await wyvernV2.filterOrders(validOrders);
      console.log(`Valid orders: ${filteredOrders.length}`);
      await wyvernV2.saveOrders(filteredOrders);

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
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      maker: Joi.string().lowercase(),
      hash: Joi.string().lowercase(),
      side: Joi.string().lowercase().valid("sell", "buy").default("sell"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).or("contract", "collection", "maker", "hash"),
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

export const getFillOptions: RouteOptions = {
  description: "Get fill order",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      side: Joi.string().lowercase().valid("buy", "sell").default("sell"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).or("contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const fill = await queries.getFill(query as queries.GetFillFilter);
      return { orders: fill ?? [] };
    } catch (error) {
      logger.error("get_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

export const getUserLiquidityOptions: RouteOptions = {
  description: "Get user liquidity",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const liquidity = await queries.getUserLiquidity({
        ...params,
        ...query,
      } as queries.GetUserLiquidityFilter);
      return { liquidity: liquidity ?? [] };
    } catch (error) {
      logger.error("get_user_liquidity_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
