import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";

export const postSyncEventsOptions: RouteOptions = {
  description: "Trigger syncing of events.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 5 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      // Warning! Some events should always be fetched together (eg.
      // wyvern-v2/wyvern-v2.3 sales + erc721/erc1155 transfers) in
      // order to have the tables filled properly.
      eventDataKinds: Joi.array().items(Joi.string()),
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      backfill: Joi.boolean().default(true),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const eventDataKinds = payload.eventDataKinds;
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const backfill = payload.backfill;

      await eventsSyncBackfill.addToQueue(fromBlock, toBlock, {
        backfill,
        eventDataKinds,
      });

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-sync-events-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
