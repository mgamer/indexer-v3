import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { setFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/sets/get-set";

export const getSetOptions: RouteOptions = {
  description: "Get aggregate stats for a particular set (collection, attribute or single token)",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      set: setFormat,
    }).label("getSetResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_set_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const set = await queries.getSet(query as queries.GetSetFilter);

      return { set };
    } catch (error) {
      logger.error("get_set_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
