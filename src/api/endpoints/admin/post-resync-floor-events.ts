/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const postResyncFloorEventsOptions: RouteOptions = {
  description: "Trigger fixing any floor events inconsistencies for any particular collection.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 5 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string(),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/),
    })
      .or("collection", "token")
      .oxor("collection", "token"),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const handleToken = async (contract: string, tokenId: string) => {
        const tokenCacheResult = await idb.oneOrNone(
          `
            SELECT
              tokens.floor_sell_id
            FROM tokens
            LEFT JOIN orders
              ON
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const latestEventResult = await idb.oneOrNone(
          `
            SELECT
              token_floor_sell_events.order_id
            FROM token_floor_sell_events
            WHERE token_floor_sell_events.contract = $/contract/
              AND token_floor_sell_events.token_id = $/tokenId/
            ORDER BY token_floor_sell_events.created_at DESC
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const bothHaveNoFloor = !tokenCacheResult.floor_sell_id && !latestEventResult?.order_id;
        const bothFloorMatch = tokenCacheResult.floor_sell_id === latestEventResult.order_id;
        if (!(bothHaveNoFloor || bothFloorMatch)) {
          await idb.none(
            `
              UPDATE tokens SET
                floor_sell_id = $/id/
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              id: latestEventResult?.id || null,
            }
          );

          const tokenSetId = `token:${contract}:${tokenId}`;
          await orderUpdatesById.addToQueue([
            {
              context: `revalidate-sell-${tokenSetId}-${Math.floor(Date.now() / 1000)}`,
              tokenSetId,
              side: "sell",
              trigger: { kind: "revalidation" },
            },
          ]);
        }
      };

      if (payload.token) {
        const [contract, tokenId] = payload.token.split(":");
        await handleToken(contract, tokenId);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-token-cache-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
