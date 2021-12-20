import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/sets";

export const getSetsOptions: RouteOptions = {
  description: "Get sets",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const data = await queries.getSets(query as queries.GetSetsFilter);
      return { data };
    } catch (error) {
      logger.error("get_sets_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
