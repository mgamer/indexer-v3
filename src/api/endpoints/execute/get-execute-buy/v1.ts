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
import { bn, formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
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
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      quantity: Joi.number().integer().positive().default(1),
      onlyQuote: Joi.boolean().default(false),
      referrer: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .default(AddressZero),
      referrerFeeBps: Joi.number().integer().positive().min(0).max(10000).default(0),
      maxFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      maxPriorityFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      skipBalanceCheck: Joi.boolean().default(false),
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
      path: Joi.array().items(
        Joi.object({
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          tokenId: Joi.string().lowercase().pattern(/^\d+$/),
          source: Joi.string().allow("", null),
          quote: Joi.number().unsafe(),
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
      // Make sure the `token` field is always an array.
      if (!Array.isArray(query.token)) {
        query.token = [query.token];
      }

      // Filling will be done through the router.
      const router = new Sdk.Common.Helpers.RouterV1(
        baseProvider,
        Sdk.Common.Addresses.Router[config.chainId]
      );

      // We need each filled order's source for the path.
      const sources = await Sources.getInstance();

      // Data needed for filling through the router / handling multi buys.
      const txs: TxData[] = [];
      const quotes: number[] = [];
      const path: any[] = [];

      // HACK: The confirmation query for the whole multi buy batch can
      // be the confirmation query of any token within the batch.
      let confirmationQuery: string;

      // For each token to be bought, generate its fill transaction.
      for (const token of query.token) {
        const [contract, tokenId] = token.split(":");

        let routerTx: TxData | undefined;
        if (query.quantity === 1) {
          // Fetch the best listing for the current token.
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
              WHERE orders.token_set_id = $/tokenSetId/
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
              ORDER BY orders.value
              LIMIT 1
            `,
            { tokenSetId: `token:${contract}:${tokenId}` }
          );

          // Return early in case no listing is available.
          if (!bestOrderResult) {
            throw Boom.badRequest("No available orders");
          }

          // Set the confirmation URL using the order id.
          confirmationQuery = `?id=${bestOrderResult.id}`;

          // The quote is the best listing's price.
          const quote = formatEth(bestOrderResult.price);

          // Store all requested tokens' fill quotes and paths.
          quotes.push(quote);
          path.push({
            contract,
            tokenId,
            source: bestOrderResult.source_id
              ? sources.getByAddress(fromBuffer(bestOrderResult.source_id))?.name
              : null,
            quote,
          });

          // Skip generating any transactions if only the quote was requested.
          if (query.onlyQuote) {
            continue;
          }

          // By default, use filling with precheck to save as much gas as possible
          // in case of failures (eg. early revert). However this is not supported
          // for exchanges that escrow the tokens (eg. Foundation).
          let usePrecheck = true;

          // Build the proper router fill transaction given the listings' kind (eg. underlying exchange).
          let tx: TxData | undefined;
          let exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND | undefined;
          switch (bestOrderResult.kind) {
            case "foundation": {
              // Generate exchange-specific fill transaction.
              const exchange = new Sdk.Foundation.Exchange(config.chainId);
              tx = exchange.fillOrderTx(
                query.taker,
                contract,
                tokenId,
                bestOrderResult.price,
                query.referrer
              );
              exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.FOUNDATION;

              // Foundation escrows the token so precheck will not work.
              usePrecheck = false;

              break;
            }

            case "wyvern-v2.3": {
              const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);

              // Create buy order to match with the listing.
              const buyOrder = order.buildMatching(router.contract.address, {
                tokenId,
                nonce: await commonHelpers.getMinNonce("wyvern-v2.3", query.taker),
                // Note that with Wyvern v2.3 we can specify a recipient.
                recipient: query.taker,
              });

              // Generate exchange-specific fill transaction.
              const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
              tx = exchange.matchTransaction(query.taker, buyOrder, order);
              exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.WYVERN_V23;

              break;
            }

            case "looks-rare": {
              const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

              // Create buy order to match with the listing.
              const buyOrder = order.buildMatching(router.contract.address, { tokenId });

              // Generate exchange-specific fill transaction.
              const exchange = new Sdk.LooksRare.Exchange(config.chainId);
              tx = exchange.matchTransaction(query.taker, order, buyOrder);
              exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.LOOKS_RARE;

              break;
            }

            case "opendao-erc721":
            case "opendao-erc1155": {
              const order = new Sdk.OpenDao.Order(config.chainId, bestOrderResult.raw_data);

              // Create buy order to match with the listing.
              const buyOrder = order.buildMatching({ tokenId, amount: 1 });

              // Generate exchange-specific fill transaction.
              const exchange = new Sdk.OpenDao.Exchange(config.chainId);
              tx = exchange.matchTransaction(query.taker, order, buyOrder);
              exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

              // Custom confirmation for partially fillable orders.
              if (bestOrderResult.kind === "opendao-erc1155") {
                confirmationQuery = `?id=${bestOrderResult.id}&checkRecentEvents=true`;
              }

              break;
            }

            case "zeroex-v4-erc721":
            case "zeroex-v4-erc1155": {
              const order = new Sdk.ZeroExV4.Order(config.chainId, bestOrderResult.raw_data);

              // Create buy order to match with the listing.
              const buyOrder = order.buildMatching({ tokenId, amount: 1 });

              // Generate exchange-specific fill transaction.
              const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
              tx = exchange.matchTransaction(query.taker, order, buyOrder);
              exchangeKind = Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4;

              // Custom confirmation for partially fillable orders.
              if (bestOrderResult.kind === "zeroex-v4-erc1155") {
                confirmationQuery = `?id=${bestOrderResult.id}&checkRecentEvents=true`;
              }

              break;
            }

            default: {
              throw Boom.notImplemented("Unsupported order kind");
            }
          }

          // HACK: Support native fills as well.
          if (!tx) {
            continue;
          }

          // Wrap the exchange-specific fill transaction via the router.
          if (bestOrderResult.token_kind === "erc721") {
            routerTx = {
              from: tx.from,
              to: router.contract.address,
              data: usePrecheck
                ? router.contract.interface.encodeFunctionData(
                    "singleERC721ListingFillWithPrecheck",
                    [
                      query.referrer,
                      tx.data,
                      exchangeKind,
                      contract,
                      tokenId,
                      query.taker,
                      fromBuffer(bestOrderResult.maker),
                      query.referrerFeeBps,
                    ]
                  )
                : router.contract.interface.encodeFunctionData("singleERC721ListingFill", [
                    query.referrer,
                    tx.data,
                    exchangeKind,
                    contract,
                    tokenId,
                    query.taker,
                    query.referrerFeeBps,
                  ]),
              value: bn(tx.value!)
                // Add the referrer fee.
                .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
                .toHexString(),
            };
          } else if (bestOrderResult.token_kind === "erc1155") {
            routerTx = {
              from: tx.from,
              to: router.contract.address,
              data: usePrecheck
                ? router.contract.interface.encodeFunctionData(
                    "singleERC1155ListingFillWithPrecheck",
                    [
                      query.referrer,
                      tx.data,
                      exchangeKind,
                      contract,
                      tokenId,
                      1,
                      query.taker,
                      fromBuffer(bestOrderResult.maker),
                      query.referrerFeeBps,
                    ]
                  )
                : router.contract.interface.encodeFunctionData("singleERC1155ListingFill", [
                    query.referrer,
                    tx.data,
                    exchangeKind,
                    contract,
                    tokenId,
                    1,
                    query.taker,
                    query.referrerFeeBps,
                  ]),
              value: bn(tx.value!)
                // Add the referrer fee.
                .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
                .toHexString(),
            };
          }
        } else {
          // For now, we only support batch filling ZeroEx V4 and OpenDao orders.

          let tx: TxData | undefined;
          const amounts: number[] = [];
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
              amounts.push(fill);
            }

            const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
            tx = exchange.batchBuyTransaction(query.taker, sellOrders, matchParams);
            const quote = formatEth(bn(tx.value!));
            quotes.push(quote);

            // Custom checking for partially fillable orders
            confirmationQuery = `?id=${sellOrders[0].hash()}&checkRecentEvents=true`;

            if (query.onlyQuote) {
              continue;
            }
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
              amounts.push(fill);
            }

            const exchange = new Sdk.OpenDao.Exchange(config.chainId);
            tx = exchange.batchBuyTransaction(query.taker, sellOrders, matchParams);
            const quote = formatEth(bn(tx.value!));
            quotes.push(quote);

            // Custom checking for partially fillable orders
            confirmationQuery = `?id=${sellOrders[0].hash()}&checkRecentEvents=true`;

            if (query.onlyQuote) {
              continue;
            }
          }

          // Wrap the exchange-specific fill transaction via the router.
          routerTx = {
            from: query.taker,
            to: router.contract.address,
            data: router.contract.interface.encodeFunctionData("batchERC1155ListingFill", [
              query.referrer,
              tx.data,
              Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
              amounts.map(() => contract),
              amounts.map(() => tokenId),
              amounts,
              query.taker,
              query.referrerFeeBps,
            ]),
            value: bn(tx.value!)
              .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
              .toHexString(),
          };
        }

        if (!routerTx) {
          throw Boom.internal("Could not generate fill transaction");
        }

        // Keep track of all the individual token fills.
        txs.push(routerTx);
      }

      // In this case, only return the quote and the path.
      const quote = quotes.reduce((a, b) => a + b, 0);
      if (query.onlyQuote) {
        return { quote, path };
      }

      // Set up generic filling steps.
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

      // Check that the taker has enough funds to fill all requested tokens.
      const totalValue = txs
        .map((tx) => bn(tx.value!))
        .reduce((a, b) => bn(a).add(b), bn(0))
        .toString();
      const balance = await baseProvider.getBalance(query.taker);
      if (!query.skipBalanceCheck && bn(balance).lt(totalValue)) {
        throw Boom.badData("ETH balance too low to proceed with transaction");
      }

      if (txs.length == 1) {
        // Do not use multi buy logic when filling a single token.
        return {
          steps: [
            {
              ...steps[0],
              status: "incomplete",
              data: {
                ...txs[0],
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
                endpoint: `/orders/executed/v1${confirmationQuery!}`,
                method: "GET",
              },
            },
          ],
          quote,
          path,
        };
      } else if (txs.length > 1) {
        // Use multi buy logic.
        return {
          steps: [
            {
              ...steps[0],
              status: "incomplete",
              data: {
                from: query.taker,
                to: router.contract.address,
                data: router.contract.interface.encodeFunctionData("multiListingFill", [
                  txs.map((tx) => tx.data),
                  txs.map((tx) => tx.value!.toString()),
                  // TODO: Support partial executions (eg. just skip reverting fills).
                  true,
                ]),
                value: totalValue,
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
                endpoint: `/orders/executed/v1${confirmationQuery!}`,
                method: "GET",
              },
            },
          ],
          quote,
          path,
        };
      } else {
        throw Boom.internal("No transaction could be generated");
      }
    } catch (error) {
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
