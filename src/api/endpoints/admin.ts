import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { baseProvider } from "../../common/provider";
import { redis } from "../../common/redis";
import { config } from "../../config";
import { addToBackfillQueue } from "../../jobs/events-sync";
import { eventTypes } from "../../sync/onchain/events";

export const postSyncEventsOptions: RouteOptions = {
  description: "Trigger syncing of on-chain events",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().valid(config.adminApiKey).required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      eventTypes: Joi.array()
        .items(Joi.string().valid(...eventTypes))
        .min(1)
        .required(),
      contracts: Joi.array().items(Joi.string().lowercase()).min(1).required(),
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      maxEventsPerBatch: Joi.number().integer().positive(),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const eventTypes = payload.eventTypes;
    const contracts = payload.contracts;
    const fromBlock = payload.fromBlock;
    const toBlock = payload.toBlock;
    const maxEventsPerBatch = payload.maxEventsPerBatch;

    // Make sure the contracts requested to sync were previously added
    for (const eventType of eventTypes) {
      const eventTypeContracts = new Set(
        await redis.smembers(`${eventType}_contracts`)
      );
      for (const contract of contracts) {
        if (!eventTypeContracts.has(contract)) {
          throw new Error(`Unknown contract ${contract}`);
        }
      }
    }

    for (const eventType of eventTypes) {
      addToBackfillQueue(
        eventType,
        contracts,
        fromBlock,
        toBlock,
        maxEventsPerBatch
      );
    }

    return { message: "Syncing request queued" };
  },
};

export const postContractsOptions: RouteOptions = {
  description: "Add new contracts for syncing",
  tags: ["api"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().valid(config.adminApiKey).required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      syncTypes: Joi.array()
        .items(Joi.string().valid(...eventTypes))
        .min(1)
        .required(),
      contract: Joi.string().lowercase().required(),
      creationBlock: Joi.number().integer().positive().required(),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const syncTypes = payload.syncTypes;
    const contract = payload.contract;
    const creationBlock = payload.creationBlock;

    // Save the contracts and their associated sync types
    for (const syncType of syncTypes) {
      await redis.sadd(`${syncType}_contracts`, contract);
    }

    // Trigger backfilling of the contracts' events
    const toBlock = await baseProvider.getBlockNumber();
    for (const syncType of syncTypes) {
      addToBackfillQueue(syncType, [contract], creationBlock, toBlock, 1024);
    }

    return { message: "Contract added" };
  },
};
