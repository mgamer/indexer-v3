import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { contractTypes } from "@/events/index";
import { addToEventsSyncBackfillQueue } from "@/jobs/events-sync";

export const postSyncEventsOptions: RouteOptions = {
  description: "Trigger syncing of on-chain events",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      contractType: Joi.string()
        .valid(...contractTypes)
        .required(),
      contracts: Joi.array().items(Joi.string().lowercase()).min(1).required(),
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
      const contractType = payload.contractType;
      const contracts = payload.contracts;
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const blocksPerBatch = payload.blocksPerBatch;

      const contractsData = require(`@/config/data/${config.chainId}/contracts`);

      // Make sure the contracts requested to sync match the contract type
      for (const contract of contracts) {
        if (!contractsData[contractType].includes(contract)) {
          throw Boom.badData(`Unknown contract ${contract}`);
        }
      }

      await addToEventsSyncBackfillQueue(
        contractType,
        contracts,
        fromBlock,
        toBlock,
        { blocksPerBatch }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error("post_sync_events_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
