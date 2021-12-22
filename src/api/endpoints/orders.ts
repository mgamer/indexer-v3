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

const getOrdersResponse = Joi.object({
  orders: Joi.array().items(
    Joi.object({
      hash: Joi.string(),
      tokenSetId: Joi.string(),
      tokenSetLabel: Joi.object({
        data: Joi.object({
          collection: Joi.string(),
        }),
        kind: Joi.string(),
      }),
      kind: Joi.string(),
      side: Joi.string(),
      maker: Joi.string(),
      price: Joi.string(),
      value: Joi.string(),
      validFrom: Joi.number(),
      validUntil: Joi.number(),
      sourceInfo: Joi.object({
        id: Joi.string(),
        bps: Joi.number(),
      }),
      royaltyInfo: Joi.string().allow(null),
      rawData: Joi.object({
        r: Joi.string(),
        s: Joi.string(),
        v: Joi.number(),
        kind: Joi.string(),
        salt: Joi.string(),
        side: Joi.number(),
        extra: Joi.string(),
        maker: Joi.string(),
        taker: Joi.string(),
        target: Joi.string(),
        calldata: Joi.string(),
        exchange: Joi.string(),
        saleKind: Joi.number(),
        basePrice: Joi.string(),
        howToCall: Joi.number(),
        listingTime: Joi.number(),
        feeRecipient: Joi.string(),
        paymentToken: Joi.string(),
        staticTarget: Joi.string(),
        expirationTime: Joi.number(),
        makerRelayerFee: Joi.number(),
        staticExtradata: Joi.string(),
        takerRelayerFee: Joi.number(),
        replacementPattern: Joi.string(),
      }),
    })
  ),
}).label("getOrdersResponse");

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
      includeAll: Joi.bool().default(true),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).or("contract", "collection", "maker", "hash"),
  },
  response: {
    schema: getOrdersResponse,
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

const getOrdersBuildResponse = Joi.object({ 
  order: Joi.object({
    chainId: Joi.number(),
    params: {
      "kind": Joi.string(),
      "exchange": Joi.string(),
      "maker": Joi.string(),
      "taker": Joi.string(),
      "makerRelayerFee": Joi.number(),
      "takerRelayerFee": Joi.number(),
      "feeRecipient": Joi.string(),
      "side": Joi.number(),
      "saleKind": Joi.number(),
      "target": Joi.string(),
      "howToCall": Joi.number(),
      "calldata": Joi.string(),
      "replacementPattern": Joi.string(),
      "staticTarget": Joi.string(),
      "staticExtradata": Joi.string(),
      "paymentToken": Joi.string(),
      "basePrice": Joi.string(),
      "extra": Joi.string(),
      "listingTime": Joi.number(),
      "expirationTime": Joi.number(),
      "salt": Joi.string(),
      "v": Joi.number(),
      "r": Joi.string(),
      "s": Joi.string()
    }
  })
}).label("getOrdersBuildResponse");

export const getOrdersBuildOptions: RouteOptions = {
  description: "Build orders",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string(),
      collection: Joi.string().lowercase(),
      maker: Joi.string().required(),
      side: Joi.string().lowercase().valid("sell", "buy").required(),
      price: Joi.string().required(),
      fee: Joi.alternatives(Joi.string(), Joi.number()).required(),
      feeRecipient: Joi.string().required(),
      listingTime: Joi.alternatives(Joi.string(), Joi.number()),
      expirationTime: Joi.alternatives(Joi.string(), Joi.number()),
      salt: Joi.string(),
    })
      .or("contract", "collection")
      .oxor("contract", "collection"),
  },
  response: {
    schema: getOrdersBuildResponse,
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
      const order = await wyvernV2.buildOrder(
        query as wyvernV2.BuildOrderOptions
      );

      if (!order) {
        return { order: null };
      }

      return { order };
    } catch (error) {
      logger.error("get_orders_build_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

const getOrdersFillResponse = Joi.object({ 
  order: Joi.object({
    chainId: Joi.number(),
    params: {
      "kind": Joi.string(),
      "exchange": Joi.string(),
      "maker": Joi.string(),
      "taker": Joi.string(),
      "makerRelayerFee": Joi.number(),
      "takerRelayerFee": Joi.number(),
      "feeRecipient": Joi.string(),
      "side": Joi.number(),
      "saleKind": Joi.number(),
      "target": Joi.string(),
      "howToCall": Joi.number(),
      "calldata": Joi.string(),
      "replacementPattern": Joi.string(),
      "staticTarget": Joi.string(),
      "staticExtradata": Joi.string(),
      "paymentToken": Joi.string(),
      "basePrice": Joi.string(),
      "extra": Joi.string(),
      "listingTime": Joi.number(),
      "expirationTime": Joi.number(),
      "salt": Joi.string(),
      "v": Joi.number(),
      "r": Joi.string(),
      "s": Joi.string()
    }
  })
}).label("getOrdersFillResponse");


export const getOrdersFillOptions: RouteOptions = {
  description: "Get order fill information",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      side: Joi.string().lowercase().valid("sell", "buy").default("sell"),
    }).or("contract", "collection"),
  },
  response: {
    schema: getOrdersFillResponse,
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

      if (!bestOrder) {
        return { order: null };
      }

      return {
        order: new Sdk.WyvernV2.Order(config.chainId, bestOrder.raw_data),
      };
    } catch (error) {
      logger.error("get_orders_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

const getUserLiquidityResponse = Joi.object({
  liquidity: Joi.array().items(
    Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        name: Joi.string(),
      }),
      buyCount: Joi.number().allow(null),
      topBuy: Joi.object({
        value: Joi.string().allow(null),
        validUntil: Joi.number().allow(null),
      }),
      sellCount: Joi.number().allow(null),
      floorSell: Joi.object({
        value: Joi.string().allow(null),
        validUntil: Joi.number().allow(null),
      }),
    })
  ),
});

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
  response: {
    schema: getUserLiquidityResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_user_liquidity_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
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
