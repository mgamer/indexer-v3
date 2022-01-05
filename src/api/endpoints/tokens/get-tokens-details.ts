import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { marketFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-tokens-details";

export const getTokensDetailsOptions: RouteOptions = {
  description: "Get tokens details",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      tokenSetId: Joi.string().lowercase(),
      onSale: Joi.boolean(),
      sortBy: Joi.string()
        .valid("tokenId", "floorSellValue", "topBuyValue")
        .default("floorSellValue"),
      sortByAttribute: Joi.string(),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .or("contract", "collection", "tokenSetId")
      .oxor("contract", "collection", "tokenSetId"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            kind: Joi.string(),
            name: Joi.string().allow("", null),
            description: Joi.string().allow("", null),
            image: Joi.string().allow(""),
            tokenId: Joi.string(),
            collection: Joi.object({
              id: Joi.string(),
              name: Joi.string(),
            }),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            owner: Joi.string().allow(null),
            attributes: Joi.any().allow(null),
          }),
          market: marketFormat,
        })
      ),
    }).label("getTokensDetailsResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_tokens_details_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await queries.getTokensDetails(
        query as queries.GetTokensDetailsFilter
      );

      return { tokens };
    } catch (error) {
      logger.error("get_tokens_details_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
