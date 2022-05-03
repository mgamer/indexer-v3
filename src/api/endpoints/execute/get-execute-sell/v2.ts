/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
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
import * as wyvernV23Check from "@/orderbook/orders/wyvern-v2.3/check";

const version = "v2";

export const getExecuteSellV2Options: RouteOptions = {
  description: "Sell any token at the best available price (accept bid)",
  tags: ["api", "3. Router"],
  plugins: {
    "hapi-swagger": {
      order: 4,
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
      referrer: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .default(AddressZero),
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
    }).label(`getExecuteSell${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-sell-${version}-handler`, `Wrong response schema: ${error}`);
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
            "o"."price",
            "c"."kind" AS "token_kind",
            "o"."token_set_id",
            "o"."raw_data"
          FROM "tokens" "t"
          JOIN "orders" "o"
            ON "t"."top_buy_id" = "o"."id"
          JOIN "contracts" "c"
            ON "t"."contract" = "c"."address"
          WHERE "t"."contract" = $/contract/
            AND "t"."token_id" = $/tokenId/
          LIMIT 1
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      if (!bestOrderResult) {
        throw Boom.badRequest("No available orders");
      }

      let tx: TxData | undefined;
      let exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND;

      const quote = formatEth(bestOrderResult.price);

      const router = new Sdk.Common.Helpers.RouterV1(
        baseProvider,
        Sdk.Common.Addresses.Router[config.chainId]
      );

      switch (bestOrderResult.kind) {
        case "wyvern-v2.3": {
          const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);

          const buildMatchingArgs: any = {
            tokenId,
            nonce: await commonHelpers.getMinNonce("wyvern-v2.3", query.taker),
          };
          if (order.params.kind?.includes("token-list")) {
            // When filling an attribute order, we also need to pass
            // in the full list of tokens the order is made on (that
            // is, the underlying token set tokens).
            const tokens = await edb.manyOrNone(
              `
                SELECT
                  "tst"."token_id"
                FROM "token_sets_tokens" "tst"
                WHERE "tst"."token_set_id" = $/tokenSetId/
              `,
              { tokenSetId: bestOrderResult.tokenSetId }
            );

            buildMatchingArgs.tokenIds = tokens.map(({ token_id }) => token_id);
          }

          // Create matching order.
          const sellOrder = order.buildMatching(router.contract.address, buildMatchingArgs);

          // Check the order's fillability.
          try {
            await wyvernV23Check.offChainCheck(sellOrder, {
              onChainApprovalRecheck: true,
            });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the sold token.
                throw Boom.badData("Taker does not own the sold token");
              }

              case "no-approval":
              case "no-user-proxy": {
                break;
              }

              default: {
                throw Boom.badData("Could not generate matching order");
              }
            }
          }

          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.WYVERN_V23;

          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

          // Create matching order.
          const sellOrder = order.buildMatching(router.contract.address, { tokenId });

          // Check: order has a valid target
          const kind = await commonHelpers.getContractKind(order.params.collection);
          if (!kind) {
            throw new Error("invalid-target");
          }

          // Check the order's fillability.
          try {
            const [contract, tokenId] = query.token.split(":");

            // Check: taker has enough balance
            const nftBalance = await commonHelpers.getNftBalance(contract, tokenId, query.taker);
            if (nftBalance.lt(1)) {
              throw new Error("no-balance");
            }
          } catch (error: any) {
            switch (error.message) {
              case "no-balance": {
                // We cannot do anything if the user doesn't own the sold token.
                throw Boom.badData("Taker does not own the sold token");
              }

              default: {
                throw Boom.badData("Could not generate matching order");
              }
            }
          }

          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.LOOKS_RARE;

          break;
        }

        case "opendao-erc721":
        case "opendao-erc1155": {
          const order = new Sdk.OpenDao.Order(config.chainId, bestOrderResult.raw_data);

          // Create matching order.
          const sellOrder = order.buildMatching({ tokenId, amount: 1 });

          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, bestOrderResult.raw_data);

          // Create matching order.
          const sellOrder = order.buildMatching({ tokenId, amount: 1 });

          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      if (!tx) {
        throw Boom.internal("Could not generate sell transaction");
      }

      let fillTx: TxData;
      if (bestOrderResult.token_kind === "erc721") {
        fillTx = {
          from: tx.from,
          to: contract,
          data: new Sdk.Common.Helpers.Erc721(
            baseProvider,
            contract
          ).contract.interface.encodeFunctionData(
            "safeTransferFrom(address,address,uint256,bytes)",
            [
              query.taker,
              router.contract.address,
              tokenId,
              router.contract.interface.encodeFunctionData("singleERC721BidFill", [
                query.referrer,
                tx.data,
                exchangeKind,
                contract,
                query.taker,
                true,
              ]),
            ]
          ),
        };
      } else {
        fillTx = {
          from: tx.from,
          to: contract,
          data: new Sdk.Common.Helpers.Erc1155(
            baseProvider,
            contract
          ).contract.interface.encodeFunctionData(
            "safeTransferFrom(address,address,uint256,uint256,bytes)",
            [
              query.taker,
              router.contract.address,
              tokenId,
              1,
              router.contract.interface.encodeFunctionData("singleERC1155BidFill", [
                query.referrer,
                tx.data,
                exchangeKind,
                contract,
                query.taker,
                true,
              ]),
            ]
          ),
        };
      }

      const steps = [
        {
          action: "Accept offer",
          description: "To sell this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: "Verify that the offer was successfully accepted",
          kind: "confirmation",
        },
      ];

      return {
        steps: [
          {
            ...steps[0],
            status: "incomplete",
            data: {
              ...fillTx,
              gasLimit: "0x" + Number(1000000).toString(16),
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
              endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
              method: "GET",
            },
          },
        ],
        quote,
      };
    } catch (error) {
      logger.error(`get-execute-sell-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
