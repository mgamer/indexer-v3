import { arrayify } from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/solidity";
import { verifyMessage } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import * as b from "@/utils/auth/blur";
import {
  verifyOffChainCancleSignature,
  saveCancellation,
  getCosignerAddress,
} from "@/utils/cosign";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

const version = "v1";

export const postCancelSignatureV1Options: RouteOptions = {
  description: "Off-chain cancel orders",
  notes:
    "If your order was created using the Seaport Oracle to allow off chain & gasless cancellations, you can just use the Kit's cancel modals, SDK's `cancelOrder`, or `/execute/cancel/`. Those tools will automatically access this endpoint for an oracle cancellation without you directly calling this endpoint.",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().description("Cancellation signature"),
      auth: Joi.string().description("Optional auth token used instead of the signature"),
    }),
    payload: Joi.object({
      orderIds: Joi.array()
        .items(Joi.string())
        .min(1)
        .required()
        .description("Ids of the orders to cancel"),
      orderKind: Joi.string()
        .valid("seaport-v1.4", "seaport-v1.5", "alienswap", "blur-bid", "payment-processor-v2")
        .required()
        .description("Exchange protocol used to bulk cancel order. Example: `seaport-v1.5`"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postPermitSignature${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-permit-signature-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const signature = query.signature;
      const orderIds = payload.orderIds;
      const orderKind = payload.orderKind;

      switch (orderKind) {
        case "blur-bid": {
          let globalMaker: string | undefined;
          const bidsByContract: { [contract: string]: string[] } = {};
          for (const orderId of orderIds) {
            const [, maker, contract, price] = orderId.split(":");

            if (!globalMaker) {
              globalMaker = maker;
            } else if (maker !== globalMaker) {
              throw Boom.badRequest("All orders must have the same maker");
            }

            if (!bidsByContract[contract]) {
              bidsByContract[contract] = [];
            }
            bidsByContract[contract].push(price);
          }

          let auth = payload.auth;
          if (!auth) {
            const signer = verifyMessage(
              arrayify(keccak256(["string[]"], [orderIds.sort()])),
              signature
            ).toLowerCase();
            if (globalMaker?.toLowerCase() !== signer) {
              throw Boom.unauthorized("Invalid signature");
            }

            auth = await b.getAuth(b.getAuthId(signer)).then((a) => a?.accessToken);
          }

          await Promise.all(
            Object.entries(bidsByContract).map(async ([contract, prices]) => {
              await axios.post(`${config.orderFetcherBaseUrl}/api/blur-cancel-collection-bids`, {
                maker: globalMaker,
                contract,
                prices,
                authToken: auth,
              });
            })
          );

          return { message: "Success" };
        }

        case "alienswap":
        case "seaport-v1.4":
        case "seaport-v1.5": {
          const ordersResult = await idb.manyOrNone(
            `
              SELECT
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.id IN ($/ids:list/)
              ORDER BY orders.id
            `,
            { ids: orderIds }
          );
          if (ordersResult.length !== orderIds.length) {
            throw Boom.badRequest("Could not find all relevant orders");
          }

          try {
            await axios.post(
              `https://seaport-oracle-${getNetworkName()}.up.railway.app/api/cancellations`,
              {
                signature,
                orders: ordersResult.map((o) => o.raw_data),
                orderKind,
              }
            );

            return { message: "Success" };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (error: any) {
            if (error.response?.data) {
              throw Boom.badRequest(error.response.data.message);
            }

            throw Boom.badRequest("Cancellation failed");
          }
        }

        case "payment-processor-v2": {
          const ordersResult = await idb.manyOrNone(
            `
              SELECT
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.id IN ($/ids:list/)
              ORDER BY orders.id
            `,
            { ids: orderIds }
          );
          if (ordersResult.length !== orderIds.length) {
            throw Boom.badRequest("Could not find all relevant orders");
          }

          const cosigner = getCosignerAddress();
          const signer = ordersResult[0].raw_data.sellerOrBuyer;
          const verified = verifyOffChainCancleSignature(orderIds, cosigner, signature, signer);

          if (!verified) {
            throw Boom.badRequest("Cancellation failed");
          }

          // Save cancellations
          for (const orderId of orderIds) {
            await saveCancellation(orderId, "payment-processor-v2", signer);
          }

          // Cancel all orders
          await orderUpdatesByIdJob.addToQueue(
            orderIds.map((orderId: string) => ({
              context: `cancel-${orderId}`,
              id: orderId,
              trigger: {
                kind: "cancel",
              },
            }))
          );

          return { message: "Success" };
        }
      }
    } catch (error) {
      logger.error(`post-cancel-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
