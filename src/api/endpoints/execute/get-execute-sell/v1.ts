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

const version = "v1";

export const getExecuteSellV1Options: RouteOptions = {
  description: "Sell any token at the best available price (accept bid)",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
      onlyQuote: Joi.boolean().default(false),
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

      // Fetch the best offer on the current token.
      const bestOrderResult = await edb.oneOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            contracts.kind AS token_kind,
            orders.price,
            orders.raw_data,
            orders.source_id,
            orders.maker
          FROM orders
          JOIN contracts
            ON orders.contract = contracts.address
          JOIN token_sets_tokens
            ON orders.token_set_id = token_sets_tokens.token_set_id
          WHERE token_sets_tokens.contract = $/contract/
            AND token_sets_tokens.token_id = $/tokenId/
            AND orders.side = 'buy'
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
          ORDER BY orders.value DESC
          LIMIT 1
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      // Return early in case no offer is available.
      if (!bestOrderResult) {
        throw Boom.badRequest("No available orders");
      }

      // Filling will be done through the router.
      const router = new Sdk.Common.Helpers.RouterV1(
        baseProvider,
        Sdk.Common.Addresses.Router[config.chainId]
      );

      // The quote is the best offer's price.
      const quote = formatEth(bestOrderResult.price);
      if (query.onlyQuote) {
        // Skip generating any transactions if only the quote was requested.
        return { quote };
      }

      // Build the proper router fill transaction given the offer's kind (eg. underlying exchange).
      let tx: TxData;
      let exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND;
      switch (bestOrderResult.kind) {
        case "wyvern-v2.3": {
          const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);

          const buildMatchingArgs: any = {
            tokenId,
            // Properly handle batch cancellations.
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

          // Create sell order to match with the offer (note that the router is the taker).
          const sellOrder = order.buildMatching(router.contract.address, buildMatchingArgs);

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.WYVERN_V23;

          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

          // Create sell order to match with the offer (note that the router is the taker).
          const sellOrder = order.buildMatching(router.contract.address, { tokenId });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder);
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.LOOKS_RARE;

          break;
        }

        case "opendao-erc721":
        case "opendao-erc1155": {
          const order = new Sdk.OpenDao.Order(config.chainId, bestOrderResult.raw_data);

          // Create sell order to match with the offer.
          const sellOrder = order.buildMatching({
            tokenId,
            amount: 1,
            // To make it compatible with the router.
            unwrapNativeToken: false,
          });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder, {
            // Using the `onReceived` hooks would fail when filling through the router.
            noDirectTransfer: true,
          });
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, bestOrderResult.raw_data);

          // Create sell order to match with the offer.
          const sellOrder = order.buildMatching({
            tokenId,
            amount: 1,
            // To make it compatible with the router.
            unwrapNativeToken: false,
          });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          tx = exchange.matchTransaction(query.taker, order, sellOrder, {
            // Using the `onReceived` hooks would fail when filling through the router.
            noDirectTransfer: true,
          });
          exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      if (!tx) {
        throw Boom.internal("Could not generate transaction(s)");
      }

      // Wrap the exchange-specific fill transaction via the router.
      // We are using the `onReceived` hooks for single-tx filling.
      let routerTx: TxData;
      if (bestOrderResult.token_kind === "erc721") {
        routerTx = {
          from: query.taker,
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
        routerTx = {
          from: query.taker,
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
              // TODO: Support selling any quantities.
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

      // Set up generic filling steps.
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
              ...routerTx,
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
