/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, regex } from "@/common/utils";
import { config } from "@/config/index";

const version = "v3";

export const getExecuteCancelV3Options: RouteOptions = {
  description: "Cancel orders",
  notes: "Cancel existing orders on any marketplace",
  tags: ["api", "Router"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      params: Joi.alternatives().try(
        // If all order ids have the kind seaport or seaport-v1.4 then cancel them all
        // Otherwise throw an error (we don't support multi-order cancelling for other order kinds)
        Joi.object({
          kind: "orderIds",
          data: {
            orderIds: Joi.array().items(Joi.string()).min(1).required(),
          },
        }),
        // If the order kind is not seaport or seaport-v1.4 throw an error
        Joi.object({
          kind: "token",
          data: {
            orderKind: Joi.string().required(),
            token: Joi.string().pattern(regex.token).required(),
          },
        }),
        // If the order kind is not seaport or seaport-v1.4 throw an error
        Joi.object({
          kind: "maker",
          data: {
            orderKind: Joi.string().required(),
            maker: Joi.string().pattern(regex.address).required(),
          },
        })
      ),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
                data: Joi.object(),
                orderIndex: Joi.number(),
              })
            )
            .required(),
        })
      ),
    }).label(`getExecuteCancel${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-cancel-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const params = payload.params;
    const actionData = params.data;

    // Cancel by maker
    if (params.kind === "maker") {
      if (!actionData.maker) {
        throw Boom.badData("maker must provide");
      }

      let cancelTx: TxData;
      const maker = actionData.maker;

      switch (actionData.orderKind) {
        case "seaport": {
          const exchange = new Sdk.Seaport.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(maker);

          break;
        }

        case "seaport-v1.4": {
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(maker);
          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      return {
        steps: [
          {
            id: "cancellation",
            action: "Submit cancellation",
            description: `To cancel these orders you must confirm the transaction and pay the gas fee`,
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: payload.maxFeePerGas
                    ? bn(payload.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                    ? bn(payload.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
                orderIndex: 0,
              },
            ],
          },
        ],
      };
    }

    // Cancel by tokenId or multile orderIds
    try {
      // Fetch the order to get cancelled
      const orderResults =
        params.kind === "token"
          ? await redb.manyOrNone(
              `
          SELECT
            orders.id,
            orders.kind,
            orders.maker,
            orders.raw_data
          FROM orders
          WHERE orders.token_set_id = $/token_set_id/ 
            AND kind = $/order_kind/
            AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
        `,
              {
                token_set_id: `token:${actionData.token}`,
                order_kind: actionData.orderKind,
              }
            )
          : await redb.manyOrNone(
              `
          SELECT
            orders.id,
            orders.kind,
            orders.maker,
            orders.raw_data
          FROM orders
          WHERE orders.id IN ($/id:csv/)
            AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
        `,
              { id: actionData.orderIds }
            );

      // Return early in case no order was found
      if (!orderResults.length) {
        throw Boom.badRequest("No matching order");
      }

      const isBulkCancel = orderResults.length > 1;
      const orderResult = orderResults[0];

      // Make sure all order is same kind
      const supportedKinds = ["seaport-v1.4", "seaport"];
      if (isBulkCancel) {
        const isSupportBulk =
          supportedKinds.includes(orderResult.kind) &&
          orderResults.every((c) => c.kind === orderResult.kind);
        if (!isSupportBulk) {
          throw Boom.badRequest("Bulk cancel not support");
        }
      }

      // Handle on-chain cancellations

      let cancelTx: TxData;
      let orderSide: "sell" | "buy";

      const maker = fromBuffer(orderResult.maker);

      // REFACTOR: Move to SDK and handle X2Y2
      switch (orderResult.kind) {
        case "seaport": {
          if (isBulkCancel) {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.Seaport.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.Seaport.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            orderSide = orders[0].getInfo()!.side;
          } else {
            const order = new Sdk.Seaport.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.Seaport.Exchange(config.chainId);

            cancelTx = exchange.cancelOrderTx(maker, order);
            orderSide = order.getInfo()!.side;
          }

          break;
        }

        case "seaport-v1.4": {
          if (isBulkCancel) {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.Seaport.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.Seaport.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            orderSide = orders[0].getInfo()!.side;
          } else {
            const order = new Sdk.SeaportV14.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

            cancelTx = exchange.cancelOrderTx(maker, order);
            orderSide = order.getInfo()!.side;
          }
          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);
          orderSide = order.params.isOrderAsk ? "sell" : "buy";

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);
          orderSide =
            order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.SELL ? "sell" : "buy";

          break;
        }

        case "universe": {
          const order = new Sdk.Universe.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Universe.Exchange(config.chainId);
          const { side } = order.getInfo()!;
          cancelTx = await exchange.cancelOrderTx(order.params);
          orderSide = side;

          break;
        }

        case "rarible": {
          const order = new Sdk.Rarible.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Rarible.Exchange(config.chainId);
          const { side } = order.getInfo()!;
          cancelTx = await exchange.cancelOrderTx(order.params);
          orderSide = side;

          break;
        }

        case "infinity": {
          const order = new Sdk.Infinity.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Infinity.Exchange(config.chainId);
          const nonce = order.nonce;
          cancelTx = exchange.cancelMultipleOrdersTx(order.signer, [nonce]);
          orderSide = order.isSellOrder ? "sell" : "buy";

          break;
        }

        case "flow": {
          const order = new Sdk.Flow.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Flow.Exchange(config.chainId);
          const nonce = order.nonce;
          cancelTx = exchange.cancelMultipleOrdersTx(order.signer, [nonce]);
          orderSide = order.isSellOrder ? "sell" : "buy";

          break;
        }

        // TODO: Add support for X2Y2 (it's tricky because of the signature requirement)

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      // TODO: We should remove the "listing"/"offer" distinction once we get to bundles
      return {
        steps: [
          {
            id: "cancellation",
            action: orderSide === "sell" || isBulkCancel ? "Submit cancellation" : "Cancel offer",
            description: `To cancel ${
              isBulkCancel ? "these orders" : "this order"
            } you must confirm the transaction and pay the gas fee`,
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: payload.maxFeePerGas
                    ? bn(payload.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                    ? bn(payload.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
                orderIndex: 0,
              },
            ],
          },
        ],
      };
    } catch (error) {
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
