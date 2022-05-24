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

const version = "v2";

export const getExecuteBuyV2Options: RouteOptions = {
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
      quantity: Joi.number().integer().positive(),
      tokens: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
      ),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      onlyQuote: Joi.boolean().default(false),
      referrer: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .default(AddressZero),
      referrerFeeBps: Joi.number().integer().positive().min(0).max(10000).default(0),
      maxFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      maxPriorityFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      skipBalanceCheck: Joi.boolean().default(false),
    })
      .or("token", "tokens")
      .oxor("token", "tokens")
      .with("quantity", "token"),
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
          quantity: Joi.number().unsafe(),
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
      // Filling will be done through the router.
      const router = new Sdk.Common.Helpers.RouterV1(
        baseProvider,
        Sdk.Common.Addresses.Router[config.chainId]
      );

      // We need each filled order's source for the path.
      const sources = await Sources.getInstance();

      // TODO: The router should support batch filling ERC721 orders as well.
      // ZeroExV4 and OpenDao ERC1155 orders can be natively batch filled, so
      // we keep them as order objects in order to aggregate in a batch later.
      const zeroExV4Batch: {
        order: Sdk.ZeroExV4.Order;
        matchParams: Sdk.ZeroExV4.Types.MatchParams;
      }[] = [];
      const openDaoBatch: {
        order: Sdk.OpenDao.Order;
        matchParams: Sdk.OpenDao.Types.MatchParams;
      }[] = [];

      // All individual fill transactions to go through the router.
      const routerTxs: TxData[] = [];

      // While everything else is handled generically.
      const generateNativeFillTx = async (
        kind: "wyvern-v2.3" | "looks-rare" | "zeroex-v4-erc721" | "opendao-erc721",
        rawData: any,
        tokenId: string
      ): Promise<
        | {
            tx: TxData;
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND;
          }
        | undefined
      > => {
        if (kind === "wyvern-v2.3") {
          const order = new Sdk.WyvernV23.Order(config.chainId, rawData);

          // Create buy order to match with the listing.
          const buyOrder = order.buildMatching(router.contract.address, {
            tokenId,
            nonce: await commonHelpers.getMinNonce("wyvern-v2.3", query.taker),
            // Note that with Wyvern v2.3 we can specify a recipient.
            recipient: query.taker,
          });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          return {
            tx: exchange.matchTransaction(query.taker, buyOrder, order),
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.WYVERN_V23,
          };
        } else if (kind === "looks-rare") {
          const order = new Sdk.LooksRare.Order(config.chainId, rawData);

          // Create buy order to match with the listing.
          const buyOrder = order.buildMatching(router.contract.address, { tokenId });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          return {
            tx: exchange.matchTransaction(query.taker, order, buyOrder),
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.LOOKS_RARE,
          };
        } else if (kind === "zeroex-v4-erc721") {
          const order = new Sdk.ZeroExV4.Order(config.chainId, rawData);

          // Create buy order to match with the listing.
          const buyOrder = order.buildMatching({ tokenId, amount: 1 });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          return {
            tx: exchange.matchTransaction(query.taker, order, buyOrder),
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
          };
        } else if (kind === "opendao-erc721") {
          const order = new Sdk.OpenDao.Order(config.chainId, rawData);

          // Create buy order to match with the listing.
          const buyOrder = order.buildMatching({ tokenId, amount: 1 });

          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          return {
            tx: exchange.matchTransaction(query.taker, order, buyOrder),
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
          };
        } else if (kind === "foundation") {
          // Generate exchange-specific fill transaction.
          const exchange = new Sdk.Foundation.Exchange(config.chainId);
          return {
            tx: exchange.fillOrderTx(
              query.taker,
              rawData.contract,
              rawData.tokenId,
              rawData.price,
              query.referrer
            ),
            exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.FOUNDATION,
          };
        }
      };

      // Data needed for filling through the router / handling multi buys.
      const txInfos: {
        tx: TxData;
        contract: string;
        tokenId: string;
        exchangeKind: Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND;
        tokenKind: "erc721" | "erc1155";
        maker: string;
        skipPrecheck?: boolean;
      }[] = [];
      const path: {
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        quote: number;
      }[] = [];

      // HACK: The confirmation query for the whole multi buy batch can
      // be the confirmation query of any token within the batch.
      let confirmationQuery: string;

      // Consistently handle a single token vs multiple tokens.
      let tokens: string[] = [];
      if (query.token) {
        tokens = [query.token];
      } else {
        tokens = query.tokens;
      }
      // Use a default quantity if missing.
      if (!query.quantity) {
        query.quantity = 1;
      }

      for (const token of tokens) {
        const [contract, tokenId] = token.split(":");

        if (query.quantity === 1) {
          // Filling a quantity of 1 implies getting the best listing for that token.
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
          if (!bestOrderResult) {
            // Return early in case no listing is available.
            throw Boom.badRequest("No available orders");
          }

          const { id, kind, token_kind, price, source_id, maker, raw_data } = bestOrderResult;

          path.push({
            contract,
            tokenId,
            quantity: 1,
            source: source_id ? sources.getByAddress(fromBuffer(source_id))?.name : null,
            quote: formatEth(bn(price).add(bn(price).mul(query.referrerFeeBps).div(10000))),
          });
          if (query.onlyQuote) {
            // Skip generating any transactions if only the quote was requested.
            continue;
          }

          // ZeroExV4 and OpenDao are handled in a custom way.
          if (kind === "zeroex-v4-erc1155") {
            const order = new Sdk.ZeroExV4.Order(config.chainId, raw_data);
            const matchParams = order.buildMatching({ amount: 1 });
            zeroExV4Batch.push({ order, matchParams });
          } else if (kind === "opendao-erc1155") {
            const order = new Sdk.OpenDao.Order(config.chainId, raw_data);
            const matchParams = order.buildMatching({ amount: 1 });
            openDaoBatch.push({ order, matchParams });
          } else {
            const data = await generateNativeFillTx(kind, raw_data, tokenId);
            if (data) {
              const { tx, exchangeKind } = data;
              txInfos.push({
                tx,
                contract,
                tokenId,
                exchangeKind,
                tokenKind: token_kind,
                maker: fromBuffer(maker),
                skipPrecheck:
                  // Foundation escrows the token, so prechecking will not work.
                  exchangeKind === Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.FOUNDATION
                    ? true
                    : undefined,
              });
            }
          }

          confirmationQuery = `?id=${id}&checkRecentEvents=true`;
        } else {
          // Only ERC1155 tokens support a quantity greater than 1.
          const kindResult = await edb.one(
            `
              SELECT contracts.kind FROM contracts
              WHERE contracts.address = $/contract/
            `,
            { contract: toBuffer(contract) }
          );
          if (kindResult?.kind !== "erc1155") {
            throw Boom.badData("Unsupported token kind");
          }

          // Fetch matching orders until the quantity to fill is met.
          const bestOrdersResult = await edb.manyOrNone(
            `
              SELECT
                x.id,
                x.kind,
                x.price,
                x.quantity_remaining,
                x.source_id,
                x.maker,
                x.raw_data
              FROM (
                SELECT
                  orders.*,
                  SUM(orders.quantity_remaining) OVER (ORDER BY price, id) - orders.quantity_remaining AS quantity
                FROM orders
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
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

          let totalQuantityToFill = Number(query.quantity);
          for (const {
            id,
            kind,
            quantity_remaining,
            price,
            source_id,
            maker,
            raw_data,
          } of bestOrdersResult) {
            const quantityFilled = Math.min(Number(quantity_remaining), totalQuantityToFill);
            totalQuantityToFill -= quantityFilled;

            const totalPrice = bn(price).mul(quantityFilled);
            path.push({
              contract,
              tokenId,
              quantity: quantityFilled,
              source: source_id ? sources.getByAddress(fromBuffer(source_id))?.name : null,
              quote: formatEth(totalPrice.add(totalPrice.mul(query.referrerFeeBps).div(10000))),
            });
            if (query.onlyQuote) {
              // Skip generating any transactions if only the quote was requested.
              continue;
            }

            // ZeroExV4 and OpenDao are handled in a custom way.
            if (kind === "zeroex-v4-erc1155") {
              const order = new Sdk.ZeroExV4.Order(config.chainId, raw_data);
              const matchParams = order.buildMatching({ amount: quantityFilled });
              zeroExV4Batch.push({ order, matchParams });
            } else if (kind === "opendao-erc1155") {
              const order = new Sdk.OpenDao.Order(config.chainId, raw_data);
              const matchParams = order.buildMatching({ amount: quantityFilled });
              openDaoBatch.push({ order, matchParams });
            } else {
              const data = await generateNativeFillTx(kind, raw_data, tokenId);
              if (data) {
                const { tx, exchangeKind } = data;
                txInfos.push({
                  tx,
                  contract,
                  tokenId,
                  exchangeKind,
                  tokenKind: kindResult.kind,
                  maker: fromBuffer(maker),
                });
              }
            }

            confirmationQuery = `?id=${id}&checkRecentEvents=true`;
          }

          // No available orders to fill the requested quantity.
          if (totalQuantityToFill > 0) {
            throw Boom.badRequest("No available orders");
          }
        }
      }

      // TODO: Update when the router will support batch ERC721 filling.
      // Handle ZeroExV4 orders.
      if (zeroExV4Batch.length >= 1) {
        const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
        if (zeroExV4Batch.length === 1) {
          // Use the single token buy method.
          const tx = exchange.matchTransaction(
            query.taker,
            zeroExV4Batch[0].order,
            zeroExV4Batch[0].matchParams
          );

          routerTxs.push({
            from: query.taker,
            to: router.contract.address,
            data: router.contract.interface.encodeFunctionData(
              "singleERC1155ListingFillWithPrecheck",
              [
                query.referrer,
                tx.data,
                Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
                zeroExV4Batch[0].order.params.nft,
                zeroExV4Batch[0].order.params.nftId,
                zeroExV4Batch[0].matchParams.nftAmount ?? 1,
                query.taker,
                zeroExV4Batch[0].order.params.maker,
                query.referrerFeeBps,
              ]
            ),
            value: bn(tx.value!)
              .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
              .toHexString(),
          });
        } else {
          // Use the gas-efficient batch buy method.
          const tx = exchange.batchBuyTransaction(
            query.taker,
            zeroExV4Batch.map((b) => b.order),
            zeroExV4Batch.map((b) => b.matchParams)
          );

          routerTxs.push({
            from: query.taker,
            to: router.contract.address,
            data: router.contract.interface.encodeFunctionData("batchERC1155ListingFill", [
              query.referrer,
              tx.data,
              Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
              zeroExV4Batch.map((b) => b.order.params.nft),
              zeroExV4Batch.map((b) => b.order.params.nftId),
              zeroExV4Batch.map((b) => b.matchParams.nftAmount ?? 1),
              query.taker,
              query.referrerFeeBps,
            ]),
            value: bn(tx.value!)
              .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
              .toHexString(),
          });
        }
      }

      // TODO: Update when the router will support batch ERC721 filling.
      // Handle OpenDao orders.
      if (openDaoBatch.length >= 1) {
        const exchange = new Sdk.OpenDao.Exchange(config.chainId);
        if (openDaoBatch.length === 1) {
          // Use the single token buy method.
          const tx = exchange.matchTransaction(
            query.taker,
            openDaoBatch[0].order,
            openDaoBatch[0].matchParams
          );

          routerTxs.push({
            from: query.taker,
            to: router.contract.address,
            data: router.contract.interface.encodeFunctionData(
              "singleERC1155ListingFillWithPrecheck",
              [
                query.referrer,
                tx.data,
                Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
                openDaoBatch[0].order.params.nft,
                openDaoBatch[0].order.params.nftId,
                openDaoBatch[0].matchParams.nftAmount ?? 1,
                query.taker,
                openDaoBatch[0].order.params.maker,
                query.referrerFeeBps,
              ]
            ),
            value: bn(tx.value!)
              .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
              .toHexString(),
          });
        } else {
          // Use the gas-efficient batch buy method.
          const tx = exchange.batchBuyTransaction(
            query.taker,
            openDaoBatch.map((b) => b.order),
            openDaoBatch.map((b) => b.matchParams)
          );

          routerTxs.push({
            from: query.taker,
            to: router.contract.address,
            data: router.contract.interface.encodeFunctionData("batchERC1155ListingFill", [
              query.referrer,
              tx.data,
              Sdk.Common.Helpers.ROUTER_EXCHANGE_KIND.ZEROEX_V4,
              openDaoBatch.map((b) => b.order.params.nft),
              openDaoBatch.map((b) => b.order.params.nftId),
              openDaoBatch.map((b) => b.matchParams.nftAmount ?? 1),
              query.taker,
              query.referrerFeeBps,
            ]),
            value: bn(tx.value!)
              .add(bn(tx.value!).mul(query.referrerFeeBps).div(10000))
              .toHexString(),
          });
        }
      }

      // Handle all the order fills.
      for (const {
        tx,
        contract,
        tokenId,
        exchangeKind,
        tokenKind,
        maker,
        skipPrecheck,
      } of txInfos) {
        if (tokenKind === "erc721") {
          routerTxs.push({
            from: tx.from,
            to: router.contract.address,
            data: !skipPrecheck
              ? router.contract.interface.encodeFunctionData(
                  "singleERC721ListingFillWithPrecheck",
                  [
                    query.referrer,
                    tx.data,
                    exchangeKind,
                    contract,
                    tokenId,
                    query.taker,
                    maker,
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
          });
        } else {
          routerTxs.push({
            from: tx.from,
            to: router.contract.address,
            data: !skipPrecheck
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
                    maker,
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
          });
        }
      }

      const quote = path.map((p) => p.quote).reduce((a, b) => a + b, 0);
      if (query.onlyQuote) {
        // Only return the quote if that's what was requested.
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
      const totalValue = txInfos
        .map(({ tx }) => bn(tx.value!))
        .reduce((a, b) => bn(a).add(b), bn(0))
        .toString();
      const balance = await baseProvider.getBalance(query.taker);
      if (!query.skipBalanceCheck && bn(balance).lt(totalValue)) {
        throw Boom.badData("ETH balance too low to proceed with transaction");
      }

      if (routerTxs.length == 1) {
        // Do not use multi buy logic when filling a single token.
        return {
          steps: [
            {
              ...steps[0],
              status: "incomplete",
              data: {
                ...routerTxs[0],
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
      } else if (routerTxs.length > 1) {
        // Use multi buy logic if multiple fill transactions are involved.
        return {
          steps: [
            {
              ...steps[0],
              status: "incomplete",
              data: {
                from: query.taker,
                to: router.contract.address,
                data: router.contract.interface.encodeFunctionData("multiListingFill", [
                  routerTxs.map((tx) => tx.data),
                  routerTxs.map((tx) => tx.value!.toString()),
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
