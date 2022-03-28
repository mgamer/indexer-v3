/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { unsyncEvents } from "@/events-sync/index";
import * as backfillEventsSync from "@/jobs/events-sync/backfill-queue";

export const postFixBlocksOptions: RouteOptions = {
  description: "Trigger fixing any orphaned block.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().required(),
      toBlock: Joi.number().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;

      const wrongBlocks = new Map<number, string>();
      for (let block = fromBlock; block <= toBlock; block++) {
        const upstreamBlockHash = (await baseProvider.getBlock(block)).hash;
        const result = await idb.manyOrNone(
          `
            (SELECT
              nft_transfer_events.block_hash
            FROM nft_transfer_events
            WHERE nft_transfer_events.block = $/block/)

            UNION

            (SELECT
              ft_transfer_events.block_hash
            FROM ft_transfer_events
            WHERE ft_transfer_events.block = $/block/)

            UNION

            (SELECT
              cancel_events.block_hash
            FROM cancel_events
            WHERE cancel_events.block = $/block/)

            UNION

            (SELECT
              fill_events_2.block_hash
            FROM fill_events_2
            WHERE fill_events_2.block = $/block/)

            UNION

            (SELECT
              bulk_cancel_events.block_hash
            FROM bulk_cancel_events
            WHERE bulk_cancel_events.block = $/block/)

            UNION

            (SELECT
              nft_approval_events.block_hash
            FROM nft_approval_events
            WHERE nft_approval_events.block = $/block/)
          `,
          { block }
        );
        for (const { block_hash } of result) {
          const blockHash = fromBuffer(block_hash);
          if (blockHash !== upstreamBlockHash) {
            wrongBlocks.set(block, blockHash);

            logger.info(
              "post-fix-blocks-handler",
              `Detected wrong block ${block} with hash ${blockHash}}`
            );
          }
        }
      }

      for (const [block, blockHash] of wrongBlocks.entries()) {
        await backfillEventsSync.addToQueue(block, block, {
          prioritized: true,
        });
        await unsyncEvents(block, blockHash);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-blocks-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
