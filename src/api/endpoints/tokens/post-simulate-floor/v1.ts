/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { genericTaker, simulateBuyTx } from "@/utils/tenderly";

const version = "v1";

export const postSimulateFloorV1Options: RouteOptions = {
  description: "Simulate the floor ask of any token for guaranteed fillability coverage",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSimulateFloor${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-simulate-floor-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const token = payload.token;

      const response = await inject({
        method: "GET",
        url: `/execute/buy/v2?token=${token}&taker=${genericTaker}&skipBalanceCheck=true`,
        headers: {
          "Content-Type": "application/json",
        },
      });

      // HACK: Extract the corresponding order id via regex
      const { groups } = /\?ids=(?<orderId>0x[0-9a-f]{64})/.exec(response.payload)!;

      const contractResult = await redb.one(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/contract/
        `,
        { contract: toBuffer(token.split(":")[0]) }
      );

      const simulationResult = await simulateBuyTx(
        contractResult.kind,
        JSON.parse(response.payload).steps[0].data
      );
      if (simulationResult.success) {
        return { message: "Floor order is fillable" };
      } else {
        const orderId = (groups as any).orderId;

        logger.warn(
          `post-simulate-floor-${version}-handler`,
          `Detected unfillable order ${orderId}`
        );

        // Invalidate the order if the simulation failed
        await inject({
          method: "POST",
          url: `/admin/invalidate-order`,
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Api-Key": config.adminApiKey,
          },
          payload: {
            id: orderId,
          },
        });

        return { message: "Floor order is not fillable (got invalidated)" };
      }
    } catch (error) {
      logger.error(`post-simulate-floor-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
