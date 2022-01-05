import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-tokens-floor";

export const getTokensFloorOptions: RouteOptions = {
  description: "Get a tokens floor",
  tags: ["api"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.object().pattern(/^[0-9]+$/, Joi.number().unsafe()),
    }).label("getTokensFloorResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_tokens_floor_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await queries.getTokensFloor(
        query as queries.GetTokensFloorFilter
      );

      return { tokens };
    } catch (error) {
      logger.error("get_tokens_floor_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
