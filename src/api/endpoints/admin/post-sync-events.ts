import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { contractKinds } from "@/events/index";
import { addToEventsSyncBackfillQueue } from "@/jobs/events-sync";

export const postSyncEventsOptions: RouteOptions = {
  description: "Trigger syncing of on-chain events",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      contractKind: Joi.string()
        .valid(...contractKinds)
        .required(),
      contracts: Joi.array()
        .items(
          Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
        )
        .min(1),
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      blocksPerBatch: Joi.number().integer().positive(),
      handleAsCatchup: Joi.boolean(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const contractKind = payload.contractKind;
      let contracts = payload.contracts;
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const blocksPerBatch = payload.blocksPerBatch;
      const handleAsCatchup = payload.handleAsCatchup;

      // Fetch all contracts of the requested kind from the database
      const matchingContracts: string[] = await db
        .manyOrNone(
          `
            select
              "c"."address"
            from "contracts" "c"
            where "c"."kind" = $/contractKind/
          `,
          { contractKind }
        )
        .then((result) => result.map(({ address }) => address));

      if (contracts) {
        // Make sure the contracts requested to sync match the given kind
        for (const contract of contracts) {
          if (!matchingContracts.includes(contract)) {
            throw Boom.badData(
              `Unknown contract ${contract} of type ${contractKind}`
            );
          }
        }
      } else {
        // Sync everything of the given kind
        contracts = matchingContracts;
      }

      await addToEventsSyncBackfillQueue(
        contractKind,
        contracts,
        fromBlock,
        toBlock,
        { blocksPerBatch, handleAsCatchup }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error("post_sync_events_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
