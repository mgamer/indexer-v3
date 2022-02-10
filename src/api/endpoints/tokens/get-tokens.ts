import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as getTokensDb from "@/queries/tokens/get-tokens";

export const getTokensOptions: RouteOptions = {
  description:
    "Get a list of tokens. Useful for showing the best priced tokens in a collection or attribute.",
  tags: ["api", "tokens"],
  validate: {
    query: Joi.object({
      collection: Joi.string(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      tokenSetId: Joi.string().lowercase(),
      onSale: Joi.boolean(),
      sortBy: Joi.string()
        .valid("tokenId", "floorSellValue", "topBuyValue")
        .default("floorSellValue"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("collection", "contract", "tokenSetId")
      .oxor("collection", "contract", "tokenSetId")
      .with("tokenId", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}$/)
            .required(),
          tokenId: Joi.string()
            .pattern(/^[0-9]+$/)
            .required(),
          name: Joi.string().allow(null, ""),
          image: Joi.string().allow(null, ""),
          collection: Joi.object({
            id: Joi.string().allow(null, ""),
            name: Joi.string().allow(null, ""),
          }),
          topBuyValue: Joi.number().unsafe().allow(null),
          floorSellValue: Joi.number().unsafe().allow(null),
        })
      ),
    }).label("getTokensResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get-tokens-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await getTokensDb.execute(query as getTokensDb.Filter);
      return { tokens };
    } catch (error) {
      logger.error("get-tokens-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
