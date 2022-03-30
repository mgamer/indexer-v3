/* eslint-disable @typescript-eslint/no-explicit-any */

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
import * as wyvernV23Utils from "@/orderbook/orders/wyvern-v2.3/utils";
import { offChainCheck } from "@/orderbook/orders/wyvern-v2.3/check";

const version = "v1";

export const getExecuteSellV1Options: RouteOptions = {
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
            "o"."token_set_id",
            "o"."raw_data"
          FROM "tokens" "t"
          JOIN "orders" "o"
            ON "t"."top_buy_id" = "o"."id"
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
          action: "Initialize wallet",
          description:
            "A one-time setup transaction to enable trading with the Wyvern Protocol (used by Open Sea)",
          kind: "transaction",
        },
        {
          action: "Approve WETH contract",
          description: "A one-time setup transaction to enable trading with WETH",
          kind: "transaction",
        },
        {
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
        },
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

      switch (bestOrderResult.kind) {
        case "wyvern-v2.3": {
          const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);

          const buildMatchingArgs: any = {
            tokenId,
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
          const sellOrder = order.buildMatching(query.taker, buildMatchingArgs);
          const sellOrderInfo = sellOrder.getInfo()!;

          let nftApprovalTx: TxData | undefined;
          let wethApprovalTx: TxData | undefined;

          // When accepting a buy order, the seller needs to approve
          // Weth as well since the fee will be taken from the maker
          // (that's a really bad design :().
          const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
          const wethApproval = await weth.getAllowance(
            query.taker,
            Sdk.WyvernV23.Addresses.TokenTransferProxy[config.chainId]
          );

          if (
            bn(wethApproval).lt(
              bn(order.params.basePrice).mul(order.params.takerRelayerFee).div(10000)
            )
          ) {
            wethApprovalTx = weth.approveTransaction(
              query.taker,
              Sdk.WyvernV23.Addresses.TokenTransferProxy[config.chainId]
            );
          }

          // Check the order's fillability.
          try {
            await offChainCheck(sellOrder, {
              onChainSellApprovalRecheck: true,
            });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance": {
                // We cannot do anything if the user doesn't own the sold token.
                throw Boom.badData("Taker does not own the sold token");
              }

              case "no-user-proxy": {
                // Generate a proxy registration transaction.

                const proxyRegistry = new Sdk.WyvernV23.Helpers.ProxyRegistry(
                  baseProvider,
                  config.chainId
                );
                const proxyRegistrationTx = proxyRegistry.registerProxyTransaction(query.maker);

                return {
                  steps: [
                    {
                      ...steps[0],
                      status: "incomplete",
                      data: proxyRegistrationTx,
                    },
                    {
                      ...steps[1],
                      status: "incomplete",
                    },
                    {
                      ...steps[2],
                      status: "incomplete",
                    },
                    {
                      ...steps[3],
                      status: "incomplete",
                    },
                    {
                      ...steps[4],
                      status: "incomplete",
                    },
                  ],
                };
              }

              case "no-approval": {
                // Generate an approval transaction

                const userProxy = await wyvernV23Utils.getUserProxy(query.maker);
                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";

                nftApprovalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(baseProvider, sellOrderInfo.contract)
                    : new Sdk.Common.Helpers.Erc1155(baseProvider, sellOrderInfo.contract)
                ).approveTransaction(query.maker, userProxy!);

                break;
              }

              default: {
                throw Boom.badData("Could not generate matching order");
              }
            }
          }

          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          const fillTx = exchange.matchTransaction(query.taker, order, sellOrder);

          return {
            steps: [
              {
                ...steps[0],
                status: "complete",
              },
              {
                ...steps[1],
                status: !wethApprovalTx ? "complete" : "incomplete",
                data: wethApprovalTx,
              },
              {
                ...steps[2],
                status: !nftApprovalTx ? "complete" : "incomplete",
                data: nftApprovalTx,
              },
              {
                ...steps[3],
                status: "incomplete",
                data: fillTx,
              },
              {
                ...steps[4],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

          // Create matching order.
          const sellOrder = order.buildMatching(query.taker, { tokenId });

          let nftApprovalTx: TxData | undefined;

          // Check: order has a valid target
          const kind = await commonHelpers.getContractKind(order.params.collection);
          if (!kind) {
            throw new Error("invalid-target");
          }

          const operator =
            kind === "erc721"
              ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
              : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId];

          // Check the order's fillability.
          try {
            // Check: maker has enough balance
            const nftBalance = await commonHelpers.getNftBalance(
              order.params.collection,
              order.params.tokenId,
              order.params.signer
            );
            if (nftBalance.lt(1)) {
              throw new Error("no-balance");
            }

            // Check: maker has set the proper approval
            const nftApproval = await commonHelpers.getNftApproval(
              order.params.collection,
              order.params.signer,
              operator
            );
            if (!nftApproval) {
              // Re-validate the approval on-chain to handle some edge-cases
              if (!(await contract.isApproved(order.params.signer, operator))) {
                throw new Error("no-approval");
              }
            }
          } catch (error: any) {
            switch (error.message) {
              case "no-balance": {
                // We cannot do anything if the user doesn't own the sold token.
                throw Boom.badData("Taker does not own the sold token");
              }

              case "no-approval": {
                // Generate an approval transaction
                nftApprovalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
                    : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection)
                ).approveTransaction(query.maker, operator);

                break;
              }

              default: {
                throw Boom.badData("Could not generate matching order");
              }
            }
          }

          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          const fillTx = exchange.matchTransaction(query.taker, order, sellOrder);

          return {
            steps: [
              {
                ...steps[2],
                status: !nftApprovalTx ? "complete" : "incomplete",
                data: nftApprovalTx,
              },
              {
                ...steps[3],
                status: "incomplete",
                data: fillTx,
              },
              {
                ...steps[4],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }
    } catch (error) {
      logger.error(`get-execute-sell-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
