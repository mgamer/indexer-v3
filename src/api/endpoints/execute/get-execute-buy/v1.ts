/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumberish } from "@ethersproject/bignumber";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

const version = "v1";

export const getExecuteBuyV1Options: RouteOptions = {
  description: "Buy any token at the best available price",
  tags: ["api", "3. Router"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .required(),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      quantity: Joi.number().integer().positive().default(1),
      onlyQuote: Joi.boolean().default(false),
      referrer: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/),
      maxFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      maxPriorityFeePerGas: Joi.string().pattern(/^[0-9]+$/),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string()
            .valid("request", "signature", "transaction", "confirmation")
            .required(),
          data: Joi.object(),
        })
      ),
      quote: Joi.number().unsafe(),
      query: Joi.object(),
    }).label(`getExecuteBuy${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-buy-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const checkTakerEthBalance = async (taker: string, price: BigNumberish) => {
        // Check the taker's Eth balance.
        const balance = await baseProvider.getBalance(taker);
        if (bn(balance).lt(price)) {
          // We cannot do anything if the taker doesn't have sufficient balance.
          throw Boom.badData("ETH balance too low to proceed with transaction");
        }
      };

      const steps = [
        {
          action: "Confirm purchase",
          description: "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: "Verify that the item was successfully purchased",
          kind: "confirmation",
        },
      ];

      let fillTx: TxData | undefined;
      let quote: number | undefined;
      let confirmationQuery: string;

      if (query.quantity === 1) {
        const [contract, tokenId] = query.token.split(":");

        const bestOrderResult = await edb.oneOrNone(
          `
            SELECT
              "o"."id",
              "o"."kind",
              "o"."token_set_id",
              "o"."price",
              "o"."raw_data"
            FROM "tokens" "t"
            JOIN "orders" "o"
              ON "t"."floor_sell_id" = "o"."id"
            WHERE "t"."contract" = $/contract/
              AND "t"."token_id" = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        if (!bestOrderResult) {
          throw Boom.badRequest("No available orders");
        }

        confirmationQuery = `?id=${bestOrderResult.id}`;

        quote = formatEth(bestOrderResult.price);
        if (query.onlyQuote) {
          return { quote };
        }

        switch (bestOrderResult.kind) {
          case "wyvern-v2.3": {
            const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);

            await checkTakerEthBalance(query.taker, order.params.basePrice);

            // Create matching order.
            const buyOrder = order.buildMatching(query.taker, {
              tokenId,
              nonce: await commonHelpers.getMinNonce("wyvern-v2.3", query.taker),
            });

            const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
            fillTx = exchange.matchTransaction(query.taker, buyOrder, order);

            break;
          }

          case "looks-rare": {
            const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

            await checkTakerEthBalance(query.taker, order.params.price);

            // Create matching order.
            const buyOrder = order.buildMatching(query.taker, { tokenId });

            const exchange = new Sdk.LooksRare.Exchange(config.chainId);
            fillTx = exchange.matchTransaction(query.taker, order, buyOrder);

            break;
          }

          case "opendao-erc721":
          case "opendao-erc1155": {
            const order = new Sdk.OpenDao.Order(config.chainId, bestOrderResult.raw_data);

            await checkTakerEthBalance(
              query.taker,
              bn(order.params.erc20TokenAmount).add(order.getFeeAmount())
            );

            // Create matching order.
            const buyOrder = order.buildMatching({ tokenId, amount: 1 });

            const exchange = new Sdk.OpenDao.Exchange(config.chainId);
            fillTx = exchange.matchTransaction(query.taker, order, buyOrder);

            // Custom checking for partially fillable orders
            if (bestOrderResult.kind === "opendao-erc1155") {
              confirmationQuery = `?id=${bestOrderResult.id}&checkRecentEvents=true`;
            }

            break;
          }

          case "zeroex-v4-erc721":
          case "zeroex-v4-erc1155": {
            const order = new Sdk.ZeroExV4.Order(config.chainId, bestOrderResult.raw_data);

            await checkTakerEthBalance(
              query.taker,
              bn(order.params.erc20TokenAmount).add(order.getFeeAmount())
            );

            // Create matching order.
            const buyOrder = order.buildMatching({ tokenId, amount: 1 });

            const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
            fillTx = exchange.matchTransaction(query.taker, order, buyOrder);

            // Custom checking for partially fillable orders
            if (bestOrderResult.kind === "zeroex-v4-erc1155") {
              confirmationQuery = `?id=${bestOrderResult.id}&checkRecentEvents=true`;
            }

            break;
          }

          default: {
            throw Boom.notImplemented("Unsupported order kind");
          }
        }

        if (!fillTx) {
          throw Boom.internal("Could not generate buy transaction");
        }
      } else {
        // For now, we only support batch filling ZeroEx V4 and OpenDao orders.

        if (config.chainId === 1) {
          const bestOrdersResult = await edb.manyOrNone(
            `
              SELECT
                x.price,
                x.quantity_remaining,
                x.raw_data
              FROM (
                SELECT
                  orders.*,
                  SUM(orders.quantity_remaining) OVER (ORDER BY price, id) - orders.quantity_remaining AS quantity
                FROM orders
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND orders.kind = 'zeroex-v4-erc1155'
              ) x WHERE x.quantity < $/quantity/
            `,
            {
              tokenSetId: `token:${query.token}`,
              quantity: query.quantity,
            }
          );

          if (!bestOrdersResult?.length) {
            throw Boom.badRequest("No available orders");
          }

          let quantityToFill = Number(query.quantity);

          const sellOrders: Sdk.ZeroExV4.Order[] = [];
          const matchParams: Sdk.ZeroExV4.Types.MatchParams[] = [];
          for (const { quantity_remaining, raw_data } of bestOrdersResult) {
            const order = new Sdk.ZeroExV4.Order(config.chainId, raw_data);
            sellOrders.push(order);

            const fill = Math.min(Number(quantity_remaining), quantityToFill);
            matchParams.push(order.buildMatching({ amount: fill }));

            quantityToFill -= fill;
          }

          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          fillTx = exchange.batchBuyTransaction(query.taker, sellOrders, matchParams);
          quote = formatEth(bn(fillTx.value!));

          // Custom checking for partially fillable orders
          confirmationQuery = `?id=${sellOrders[0].hash()}&checkRecentEvents=true`;

          if (query.onlyQuote) {
            return { quote };
          }

          await checkTakerEthBalance(query.taker, bn(fillTx.value!));
        } else {
          const bestOrdersResult = await edb.manyOrNone(
            `
              SELECT
                x.price,
                x.quantity_remaining,
                x.raw_data
              FROM (
                SELECT
                  orders.*,
                  SUM(orders.quantity_remaining) OVER (ORDER BY price, id) - orders.quantity_remaining AS quantity
                FROM orders
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.side = 'sell'
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND orders.kind = 'opendao-erc1155'
                  AND orders.maker != $/taker/
              ) x WHERE x.quantity < $/quantity/
            `,
            {
              tokenSetId: `token:${query.token}`,
              quantity: query.quantity,
              taker: toBuffer(query.taker),
            }
          );

          if (!bestOrdersResult?.length) {
            throw Boom.badRequest("No available orders");
          }

          let quantityToFill = Number(query.quantity);

          const sellOrders: Sdk.OpenDao.Order[] = [];
          const matchParams: Sdk.OpenDao.Types.MatchParams[] = [];
          for (const { quantity_remaining, raw_data } of bestOrdersResult) {
            const order = new Sdk.OpenDao.Order(config.chainId, raw_data);
            sellOrders.push(order);

            const fill = Math.min(Number(quantity_remaining), quantityToFill);
            matchParams.push(order.buildMatching({ amount: fill }));

            quantityToFill -= fill;
          }

          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          fillTx = exchange.batchBuyTransaction(query.taker, sellOrders, matchParams);
          quote = formatEth(bn(fillTx.value!));

          // Custom checking for partially fillable orders
          confirmationQuery = `?id=${sellOrders[0].hash()}&checkRecentEvents=true`;

          if (query.onlyQuote) {
            return { quote };
          }

          await checkTakerEthBalance(query.taker, bn(fillTx.value!));
        }
      }

      return {
        steps: [
          {
            ...steps[0],
            status: "incomplete",
            data: {
              ...fillTx,
              maxFeePerGas: query.maxFeePerGas ? bn(query.maxFeePerGas).toHexString() : undefined,
              maxPriorityFeePerGas: query.maxPriorityFeePerGas
                ? bn(query.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          },
          {
            ...steps[1],
            status: "incomplete",
            data: {
              endpoint: `/orders/executed/v1${confirmationQuery}`,
              method: "GET",
            },
          },
        ],
        quote,
      };
    } catch (error) {
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
