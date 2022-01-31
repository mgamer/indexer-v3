import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { addToBlocksFetchBackfillQueue } from "@/jobs/blocks-fetch";

export const postFetchBlocksOptions: RouteOptions = {
  description: "Trigger syncing of block timestamps",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
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

      await addToBlocksFetchBackfillQueue(fromBlock, toBlock);

      return { message: "Success" };
    } catch (error) {
      logger.error("post_fetch_blocks_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
