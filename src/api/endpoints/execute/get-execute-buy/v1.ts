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
import { bn, toBuffer } from "@/common/utils";
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
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/)
        .required(),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
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
      const [contract, tokenId] = query.token.split(":");

      const bestOrderResult = await edb.oneOrNone(
        `
          SELECT
            "o"."id",
            "o"."kind",
            "o"."token_set_id",
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
        throw Boom.badRequest("No liquidity available");
      }

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

      const checkTakerEthBalance = async (taker: string, price: BigNumberish) => {
        // Check the taker's Eth balance.
        const balance = await baseProvider.getBalance(taker);
        if (bn(balance).lt(price)) {
          // We cannot do anything if the taker doesn't have sufficient balance.
          throw Boom.badData("Taker does not have sufficient balance");
        }
      };

      let fillTx: TxData | undefined;
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

          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      if (!fillTx) {
        throw Boom.internal("Could not generate buy transaction");
      }

      return {
        steps: [
          {
            ...steps[0],
            status: "incomplete",
            data: fillTx,
          },
          {
            ...steps[1],
            status: "incomplete",
            data: {
              endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
              method: "GET",
            },
          },
        ],
      };
    } catch (error) {
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
