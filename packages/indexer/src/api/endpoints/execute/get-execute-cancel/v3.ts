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
  description: "Cancel order",
  notes: "Cancel an existing order on any marketplace",
  tags: ["api", "Router"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      cancelType: Joi.string().valid(["single", "bulk", "all", "token"]),
      orderKind: Joi.string().optional(),
      params: Joi.alternatives().try(
        Joi.object({
          maker: Joi.string().optional(),
        }),
        Joi.object({
          tokenId: Joi.string()
            .optional()
            .description("tokenId, Example: `0x407c5d2c02ab0e4b0a98d14778a5de180eb1357f:755`"),
        }),
        Joi.object({
          id: Joi.alternatives()
            .try(Joi.array().items(Joi.string()).max(20), Joi.string())
            .description(
              "Array of Order IDs. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
            .optional(),
        })
      ),
      softCancel: Joi.boolean()
        .default(false)
        .description("If true, the order will be soft-cancelled."),
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

    const cancelType = payload.cancelType;
    const isCancelAll = cancelType === "all";
    const cancelToken = cancelType === "token";

    const params = payload.params;

    if (isCancelAll || cancelToken) {
      throw Boom.badData("orderKind must provide");
    }

    // Cancel all
    if (isCancelAll) {
      if (!params.maker) {
        throw Boom.badData("maker must provide");
      }

      let cancelTx: TxData;
      const maker = params.maker;

      switch (payload.orderKind) {
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

    const tokenId = params.tokenId;
    let isBulkCancel = Array.isArray(params.id);
    const orderIds = isBulkCancel ? params.id : [params.id];

    if (!isCancelAll) {
      if (!tokenId && !orderIds.length) {
        throw Boom.badData("No matching order");
      }
    }

    try {
      // Fetch the order to get cancelled
      const orderResults = tokenId
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
              token_set_id: `token:${tokenId}`,
              order_kind: payload.orderKind,
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
            { id: orderIds }
          );

      // Return early in case no order was found
      if (!orderResults.length) {
        throw Boom.badData("No matching order");
      }

      const orderResult = orderResults[0];
      if (orderResults.length > 1) {
        isBulkCancel = true;
      }

      // Make sure all order is same kind
      const supportedKinds = ["seaport-v1.4", "seaport"];
      if (isBulkCancel) {
        const isSupportBulk =
          supportedKinds.includes(orderResult.kind) &&
          orderResults.every((c) => c.kind === orderResult.kind);
        if (!isSupportBulk) {
          throw Boom.badData("Bulk cancel not support");
        }
      }

      // Handle off-chain cancellations

      const cancellationZone = Sdk.SeaportV14.Addresses.CancellationZone[config.chainId];
      const isOracleCancellable =
        orderResult.kind === "seaport-v1.4" && orderResult.raw_data.zone === cancellationZone;
      if (isOracleCancellable || payload.softCancel) {
        return {
          steps: [
            {
              id: "cancellation-signature",
              action: "Cancel order",
              description: "Authorize the cancellation of the order",
              kind: "signature",
              items: [
                {
                  status: "incomplete",
                  data: {
                    sign: isOracleCancellable
                      ? {
                          signatureKind: "eip712",
                          domain: {
                            name: "SignedZone",
                            version: "1.0.0",
                            chainId: config.chainId,
                            verifyingContract: cancellationZone,
                          },
                          types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
                          value: {
                            orderHashes: [orderResult.id],
                          },
                        }
                      : {
                          signatureKind: "eip191",
                          message: orderResult.id,
                        },
                    post: {
                      endpoint: "/execute/cancel-signature/v1",
                      method: "POST",
                      body: {
                        orderId: orderResult.id,
                        softCancel: !isOracleCancellable,
                      },
                    },
                  },
                  orderIndex: 0,
                },
              ],
            },
          ],
        };
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
