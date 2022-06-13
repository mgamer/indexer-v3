/* eslint-disable @typescript-eslint/no-explicit-any */

import { joinSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";
import { parseOpenSeaOrder } from "@/orderbook/orders/wyvern-v2.3/opensea";

const version = "v2";

export const postOrderV2Options: RouteOptions = {
  description: "Publish a single order.",
  tags: ["api", "1. Order Book"],
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  validate: {
    payload: Joi.object({
      order: Joi.object({
        kind: Joi.string()
          .lowercase()
          .valid("opensea", "wyvern-v2.3", "looks-rare", "721ex", "zeroex-v4", "seaport")
          .required(),
        data: Joi.object().required(),
      }),
      orderbook: Joi.string()
        .lowercase()
        .valid("reservoir", "opensea", "looks-rare")
        .default("reservoir"),
      source: Joi.string(),
      attribute: Joi.object({
        collection: Joi.string().required(),
        key: Joi.string().required(),
        value: Joi.string().required(),
      }),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;

    try {
      const order = payload.order;
      const orderbook = payload.orderbook;
      const source = payload.source;
      // Only relevant/present for attribute bids.
      const attribute = payload.attribute;

      switch (order.kind) {
        // Publish a native OpenSea order.
        case "opensea": {
          const parsedOrder = await parseOpenSeaOrder(order.data);
          if (!parsedOrder) {
            throw Boom.badRequest("Invalid/unsupported order");
          }

          const orderInfo: orders.wyvernV23.OrderInfo = {
            orderParams: parsedOrder.params,
            metadata: {},
          };
          const [result] = await orders.wyvernV23.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }

        case "721ex": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderInfo: orders.openDao.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema: attribute && {
                kind: "attribute",
                data: {
                  collection: attribute.collection,
                  attributes: [
                    {
                      key: attribute.key,
                      value: attribute.value,
                    },
                  ],
                },
              },
              source,
            },
          };
          const [result] = await orders.openDao.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }

        case "zeroex-v4": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderInfo: orders.zeroExV4.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema: attribute && {
                kind: "attribute",
                data: {
                  collection: attribute.collection,
                  attributes: [
                    {
                      key: attribute.key,
                      value: attribute.value,
                    },
                  ],
                },
              },
              source,
            },
          };
          const [result] = await orders.zeroExV4.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }

        case "seaport": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderInfo: orders.seaport.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema: attribute && {
                kind: "attribute",
                data: {
                  collection: attribute.collection,
                  attributes: [
                    {
                      key: attribute.key,
                      value: attribute.value,
                    },
                  ],
                },
              },
              source,
            },
          };
          const [result] = await orders.seaport.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }

        case "wyvern-v2.3": {
          // Both Reservoir and OpenSea are supported as orderbooks.
          switch (orderbook) {
            case "reservoir": {
              const orderInfo: orders.wyvernV23.OrderInfo = {
                orderParams: order.data,
                metadata: {
                  schema: attribute && {
                    kind: "attribute",
                    data: {
                      collection: attribute.collection,
                      attributes: [
                        {
                          key: attribute.key,
                          value: attribute.value,
                        },
                      ],
                    },
                  },
                  source,
                },
              };
              const [result] = await orders.wyvernV23.save([orderInfo]);
              if (result.status === "success") {
                return { message: "Success" };
              } else {
                throw Boom.badRequest(result.status);
              }
            }

            // Publish to OpenSea's native orderbook.
            case "opensea": {
              const sdkOrder = new Sdk.WyvernV23.Order(config.chainId, order.data);
              const orderInfo = sdkOrder.getInfo();
              if (!orderInfo) {
                throw Boom.badData("Could not parse order");
              }

              // For now, OpenSea only supports single-token orders.
              if (!(orderInfo as any).tokenId) {
                throw Boom.badData("Unsupported order kind");
              }

              const osOrder = {
                ...sdkOrder.params,
                makerProtocolFee: "0",
                takerProtocolFee: "0",
                makerReferrerFee: "0",
                feeMethod: 1,
                quantity: "1",
                metadata: {
                  asset: {
                    id: (orderInfo as any).tokenId,
                    address: orderInfo.contract,
                  },
                  schema: sdkOrder.params.kind?.startsWith("erc721") ? "ERC721" : "ERC1155",
                },
                hash: sdkOrder.hash(),
              };

              // Post order via OpenSea's APIs.
              await axios
                .post(
                  `https://${
                    config.chainId === 4 ? "testnets-api." : "api."
                  }opensea.io/wyvern/v1/orders/post`,
                  JSON.stringify(osOrder),
                  {
                    headers:
                      config.chainId === 1
                        ? {
                            "Content-Type": "application/json",
                            "X-Api-Key": String(process.env.OPENSEA_API_KEY),
                          }
                        : {
                            "Content-Type": "application/json",
                            // The request will fail if passing the API key on Rinkeby.
                          },
                  }
                )
                .catch((error) => {
                  if (error.response) {
                    logger.error(
                      `post-order-${version}-handler`,
                      `Failed to post order to OpenSea: ${JSON.stringify(error.response.data)}`
                    );
                  }

                  throw Boom.badRequest(JSON.stringify(error.response.data));
                });

              break;
            }

            default: {
              throw Boom.badData("Unknown orderbook");
            }
          }

          break;
        }

        case "looks-rare": {
          // Both Reservoir and LooksRare are supported as orderbooks.
          switch (orderbook) {
            case "reservoir": {
              const orderInfo: orders.looksRare.OrderInfo = {
                orderParams: order.data,
                metadata: {
                  source,
                },
              };
              const [result] = await orders.looksRare.save([orderInfo]);
              if (result.status === "success") {
                return { message: "Success" };
              } else {
                throw Boom.badRequest(result.status);
              }
            }

            // Publish to LooksRare's native orderbook.
            case "looks-rare": {
              const sdkOrder = new Sdk.LooksRare.Order(config.chainId, order.data);
              const lrOrder = {
                ...sdkOrder.params,
                signature: joinSignature({
                  v: sdkOrder.params.v!,
                  r: sdkOrder.params.r!,
                  s: sdkOrder.params.s!,
                }),
                tokenId: sdkOrder.params.kind === "single-token" ? sdkOrder.params.tokenId : null,
                // For now, no order kinds have any additional params.
                params: [],
              };

              // Post order via LooksRare's APIs.
              await axios
                .post(
                  `https://${
                    config.chainId === 4 ? "api-rinkeby." : "api."
                  }looksrare.org/api/v1/orders`,
                  JSON.stringify(lrOrder),
                  {
                    headers: {
                      "Content-Type": "application/json",
                      "X-Looks-Api-Key": String(process.env.LOOKSRARE_API_KEY),
                    },
                  }
                )
                .catch((error) => {
                  if (error.response) {
                    logger.error(
                      `post-order-${version}-handler`,
                      `Failed to post order to LooksRare: ${JSON.stringify(error.response.data)}`
                    );
                  }

                  throw Boom.badRequest(JSON.stringify(error.response.data));
                });

              break;
            }

            default: {
              throw Boom.badData("Unknown orderbook");
            }
          }
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
