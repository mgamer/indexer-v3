import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { setFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/stats/get-stats";

export const getStatsOptions: RouteOptions = {
  description:
    "Get aggregate stats for a particular set (collection, attribute or single token)",
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
      stats: setFormat,
    }).label("getStatsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_stats_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const stats = await queries.getStats(query as queries.GetStatsFilter);

      return { stats };
    } catch (error) {
      logger.error("get_stats_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
