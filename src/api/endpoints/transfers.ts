import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/transfers";

export const getTransfersOptions: RouteOptions = {
  description: "Get transfer events",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      account: Joi.string().lowercase(),
      direction: Joi.string().lowercase().valid("from", "to").when("account", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
      type: Joi.string().lowercase().valid("transfer", "sale"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }).xor("contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const transfers = await queries.getTransfers(
        query as queries.GetTransfersFilter
      );
      return { transfers };
    } catch (error) {
      logger.error("get_transfers_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
