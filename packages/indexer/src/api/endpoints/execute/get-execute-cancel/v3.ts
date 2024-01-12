/* eslint-disable @typescript-eslint/no-explicit-any */

import { keccak256 } from "@ethersproject/solidity";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";
import * as b from "@/utils/auth/blur";
import * as offchainCancel from "@/utils/offchain-cancel";

const version = "v3";

type Step = {
  id: string;
  action: string;
  description: string;
  kind: string;
  items: StepItem[];
};

type StepItem = {
  status: string;
  tip?: string;
  data?: object;
};

export const getExecuteCancelV3Options: RouteOptions = {
  description: "Cancel Orders",
  notes: "Cancel existing orders on any marketplace",
  tags: ["api"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      orderIds: Joi.array().items(Joi.string()).min(1),
      maker: Joi.string().pattern(regex.address),
      orderKind: Joi.string().valid(
        "blur",
        "seaport",
        "seaport-v1.4",
        "seaport-v1.5",
        "looks-rare-v2",
        "zeroex-v4-erc721",
        "zeroex-v4-erc1155",
        "payment-processor-v2",
        "rarible",
        "alienswap"
      ),
      token: Joi.string().pattern(regex.token),
      blurAuth: Joi.string(),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
    })
      .oxor("orderIds", "token")
      .or("orderIds", "token", "maker", "orderKind"),
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
                tip: Joi.string(),
                data: Joi.object(),
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
  handler: async (request: Request): Promise<{ steps: Step[] }> => {
    const payload = request.payload as any;

    const steps: Step[] = [];

    const gasSettings = {
      maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
      maxPriorityFeePerGas: payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined,
    };

    // Cancel by maker
    if (payload.maker && !payload.token) {
      let cancelTx: TxData;
      switch (payload.orderKind) {
        case "seaport": {
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);

          break;
        }

        case "seaport-v1.4": {
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        case "seaport-v1.5": {
          const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        case "alienswap": {
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        case "payment-processor": {
          const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
          cancelTx = exchange.revokeMasterNonceTx(payload.maker);
          break;
        }

        case "payment-processor-v2": {
          const exchange = new Sdk.PaymentProcessorV2.Exchange(config.chainId);
          cancelTx = exchange.revokeMasterNonceTx(payload.maker);
          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      steps.push({
        id: "cancellation",
        action: "Submit cancellation",
        description: "To cancel these orders you must confirm the transaction and pay the gas fee",
        kind: "transaction",
        items: [
          {
            status: "incomplete",
            data: {
              ...cancelTx,
              ...gasSettings,
            },
          },
        ],
      });

      return { steps };
    }

    // Cancel by token or order ids
    try {
      // Handle Blur bids
      const blurBidsOrderIds =
        payload.orderIds?.filter((orderId: string) => orderId.startsWith("blur-collection-bid")) ??
        [];

      if (blurBidsOrderIds.length) {
        const maker = blurBidsOrderIds[0].split(":")[1];

        const authStep: Step = {
          id: "auth",
          action: "Sign in to Blur",
          description: "Some marketplaces require signing an auth message before filling",
          kind: "signature",
          items: [],
        };

        const cancellationStep: Step = {
          id: "cancellation-signature",
          action: "Cancel order",
          description: "Authorize the cancellation of the order",
          kind: "signature",
          items: [],
        };

        steps.push(authStep);
        steps.push(cancellationStep);

        // Handle Blur authentication
        const blurAuthId = b.getAuthId(maker);
        let blurAuth = await b.getAuth(blurAuthId);
        if (!blurAuth) {
          if (payload.blurAuth) {
            blurAuth = { accessToken: payload.blurAuth };
          } else {
            const blurAuthChallengeId = b.getAuthChallengeId(maker);

            let blurAuthChallenge = await b.getAuthChallenge(blurAuthChallengeId);
            if (!blurAuthChallenge) {
              blurAuthChallenge = (await axios
                .get(`${config.orderFetcherBaseUrl}/api/blur-auth-challenge?taker=${maker}`)
                .then((response) => response.data.authChallenge)) as b.AuthChallenge;

              await b.saveAuthChallenge(
                blurAuthChallengeId,
                blurAuthChallenge,
                // Give a 1 minute buffer for the auth challenge to expire
                Math.floor(new Date(blurAuthChallenge?.expiresOn).getTime() / 1000) - now() - 60
              );
            }

            authStep.items.push({
              status: "incomplete",
              data: {
                sign: {
                  signatureKind: "eip191",
                  message: blurAuthChallenge.message,
                },
                post: {
                  endpoint: "/execute/auth-signature/v1",
                  method: "POST",
                  body: {
                    kind: "blur",
                    id: blurAuthChallengeId,
                  },
                },
              },
            });

            // Force the client to poll
            cancellationStep.items.push({
              status: "incomplete",
              tip: "This step is dependent on a previous step. Once you've completed it, re-call the API to get the data for this step.",
            });
          }
        } else {
          authStep.items.push({
            status: "complete",
          });

          const orderIds = blurBidsOrderIds.sort();
          cancellationStep.items.push({
            status: "incomplete",
            data: {
              sign: {
                signatureKind: "eip191",
                message: keccak256(["string[]"], [orderIds]),
              },
              post: {
                endpoint: "/execute/cancel-signature/v1",
                method: "POST",
                body: {
                  orderIds,
                  orderKind: "blur-bid",
                },
              },
            },
          });

          // remove authStep
          steps.splice(
            steps.findIndex((el) => el == authStep),
            1
          );
        }
      }

      // Fetch the orders to get cancelled
      const orderResults = payload.token
        ? await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.token_set_id = $/tokenSetId/
                AND side = $/side/
                AND maker = $/maker/
                AND kind = $/orderKind/
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              side: "sell",
              tokenSetId: `token:${payload.token}`,
              maker: toBuffer(payload.maker),
              orderKind: payload.orderKind,
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
              WHERE orders.id IN ($/ids:csv/)
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              ids: payload.orderIds,
            }
          );

      // Return early in case no matching orders were found
      if (!orderResults.length) {
        throw Boom.badRequest("No matching order(s)");
      }

      // group all orderResults by kind
      const ordersByKind: Record<string, any[]> = {};

      for (const orderResult of orderResults) {
        if (!ordersByKind[orderResult.kind]) {
          ordersByKind[orderResult.kind] = [];
        }
        ordersByKind[orderResult.kind].push(orderResult);
      }

      // Handle off-chain cancellations
      const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];

      // for each kind, we will grab the off-chain cancellable orders, and generate the step for it
      for (const [kind, ordersResults] of Object.entries(ordersByKind)) {
        let cancellable = [];
        if (kind == "seaport-v1.4" || kind == "seaport-v1.5" || kind == "alienswap") {
          cancellable = orderResults.filter((el) => el.raw_data.zone === cancellationZone);
        } else if (kind == "payment-processor-v2") {
          cancellable = orderResults.filter(
            (el) => el.raw_data.cosigner === offchainCancel.cosigner().address.toLowerCase()
          );
        } else {
          // only those ^ kind are managed for off-chain orders
          continue;
        }

        const orderIds = cancellable.map((el) => el.id);
        if (orderIds.length) {
          if (kind == "payment-processor-v2") {
            steps.push({
              id: "cancellation-signature",
              action: "Cancel order",
              description: "Authorize the cancellation of the order(s)",
              kind: "signature",
              items: [
                {
                  status: "incomplete",
                  data: {
                    sign: offchainCancel.paymentProcessorV2.generateOffChainCancellationSignatureData(
                      orderIds.sort()
                    ),
                    post: {
                      endpoint: "/execute/cancel-signature/v1",
                      method: "POST",
                      body: {
                        orderIds: orderIds.sort(),
                        orderKind: kind,
                      },
                    },
                  },
                },
              ],
            });
          } else {
            steps.push({
              id: "cancellation-signature",
              action: "Cancel order",
              description: "Authorize the cancellation of the order(s)",
              kind: "signature",
              items: [
                {
                  status: "incomplete",
                  data: {
                    sign: offchainCancel.seaport.generateOffChainCancellationSignatureData(
                      orderIds
                    ),
                    post: {
                      endpoint: "/execute/cancel-signature/v1",
                      method: "POST",
                      body: {
                        orderIds: orderIds.sort(),
                        orderKind: kind,
                      },
                    },
                  },
                },
              ],
            });
          }
        }

        // remove off-chain cancellable orders from orderResult
        for (const order of cancellable) {
          ordersResults.splice(
            ordersResults.findIndex((el) => el === order),
            1
          );
        }

        if (ordersResults.length == 0) {
          delete ordersByKind[kind];
        }
      }

      // Handle on-chain cancellations

      // for each of the orders left, we will build the steps needed to cancel
      for (const [kind, orderResults] of Object.entries(ordersByKind)) {
        if (!orderResults.length) continue;

        let cancelTx: TxData | undefined;

        // Set up generic filling steps
        const authStep: Step = {
          id: "auth",
          action: "Sign in to Blur",
          description: "Some marketplaces require signing an auth message before filling",
          kind: "signature",
          items: [],
        };

        const cancellationStep: Step = {
          id: "cancellation-signature",
          action: "Cancel order",
          description:
            "To cancel these orders you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        };

        const orderResult = orderResults[0];
        const maker = fromBuffer(orderResult.maker);
        switch (kind) {
          case "seaport": {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.SeaportV11.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.SeaportV11.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            break;
          }

          case "seaport-v1.4": {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.SeaportV14.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            break;
          }

          case "seaport-v1.5": {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.SeaportV15.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.SeaportV15.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            break;
          }

          case "alienswap": {
            const orders = orderResults.map((dbOrder) => {
              return new Sdk.Alienswap.Order(config.chainId, dbOrder.raw_data);
            });
            const exchange = new Sdk.Alienswap.Exchange(config.chainId);

            cancelTx = exchange.cancelOrdersTx(maker, orders);
            break;
          }

          case "looks-rare-v2": {
            const order = new Sdk.LooksRareV2.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.LooksRareV2.Exchange(config.chainId);

            cancelTx = exchange.cancelOrderTx(maker, order);

            break;
          }

          case "zeroex-v4-erc721":
          case "zeroex-v4-erc1155": {
            const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

            cancelTx = exchange.cancelOrderTx(maker, order);
            break;
          }

          case "rarible": {
            const order = new Sdk.Rarible.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.Rarible.Exchange(config.chainId);
            cancelTx = await exchange.cancelOrderTx(order.params);

            break;
          }

          case "payment-processor": {
            const order = new Sdk.PaymentProcessor.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
            cancelTx = exchange.cancelOrderTx(maker, order);

            break;
          }

          case "payment-processor-v2": {
            const order = new Sdk.PaymentProcessorV2.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.PaymentProcessorV2.Exchange(config.chainId);
            cancelTx = exchange.cancelOrderTx(maker, order);

            break;
          }

          case "blur": {
            // Handle Blur authentication
            const blurAuthId = b.getAuthId(maker);
            let blurAuth = await b.getAuth(blurAuthId);
            if (!blurAuth) {
              if (payload.blurAuth) {
                blurAuth = { accessToken: payload.blurAuth };
              } else {
                const blurAuthChallengeId = b.getAuthChallengeId(maker);

                let blurAuthChallenge = await b.getAuthChallenge(blurAuthChallengeId);
                if (!blurAuthChallenge) {
                  blurAuthChallenge = (await axios
                    .get(`${config.orderFetcherBaseUrl}/api/blur-auth-challenge?taker=${maker}`)
                    .then((response) => response.data.authChallenge)) as b.AuthChallenge;

                  await b.saveAuthChallenge(
                    blurAuthChallengeId,
                    blurAuthChallenge,
                    // Give a 1 minute buffer for the auth challenge to expire
                    Math.floor(new Date(blurAuthChallenge?.expiresOn).getTime() / 1000) - now() - 60
                  );
                }

                authStep.items.push({
                  status: "incomplete",
                  data: {
                    sign: {
                      signatureKind: "eip191",
                      message: blurAuthChallenge.message,
                    },
                    post: {
                      endpoint: "/execute/auth-signature/v1",
                      method: "POST",
                      body: {
                        kind: "blur",
                        id: blurAuthChallengeId,
                      },
                    },
                  },
                });

                steps.push(authStep);

                // Force the client to poll
                cancellationStep.items.push({
                  status: "incomplete",
                  tip: "This step is dependent on a previous step. Once you've completed it, re-call the API to get the data for this step.",
                });
              }
            } else {
              const blurCancelTx = await axios
                .post(`${config.orderFetcherBaseUrl}/api/blur-cancel-listings`, {
                  maker,
                  contract: orderResult.raw_data.collection,
                  tokenId: orderResult.raw_data.tokenId,
                  authToken: blurAuth.accessToken,
                })
                .then((response) => response.data);
              if (!blurCancelTx) {
                throw Boom.badRequest("No matching order(s)");
              }

              cancelTx = blurCancelTx;
            }
            break;
          }

          default: {
            throw Boom.notImplemented("Unsupported order kind");
          }
        }

        if (cancelTx !== undefined) {
          cancellationStep.items.push({
            status: "incomplete",
            data: {
              ...cancelTx!,
              ...gasSettings,
            },
          });
        }

        if (cancellationStep.items.length) {
          steps.push(cancellationStep);
        }
      }

      return {
        steps,
      };
    } catch (error) {
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
