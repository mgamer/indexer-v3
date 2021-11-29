import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { GetTokensFilter, getTokens } from "@/entities/tokens";

export const getTokensOptions: RouteOptions = {
  description: "Get tokens",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .when("contract", {
          is: Joi.exist(),
          then: Joi.optional(),
          otherwise: Joi.forbidden(),
        }),
      owner: Joi.string().lowercase(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await getTokens(query as GetTokensFilter).catch((error) =>
        console.log(error)
      );

      return { tokens };
    } catch (error) {
      logger.error("get_tokens_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
