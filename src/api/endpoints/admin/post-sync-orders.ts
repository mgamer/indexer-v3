import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { addToOrdersSyncBackfillQueue } from "@/jobs/orders-sync";

export const postSyncOrdersOptions: RouteOptions = {
  description: "Trigger syncing of on-chain orders",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      blocksPerBatch: Joi.number().integer().positive(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const blocksPerBatch = payload.blocksPerBatch;

      await addToOrdersSyncBackfillQueue(fromBlock, toBlock, {
        blocksPerBatch,
      });

      return { message: "Success" };
    } catch (error) {
      logger.error("post_sync_events_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
