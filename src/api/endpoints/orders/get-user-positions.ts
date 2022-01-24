import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-user-positions";

export const getUserPositionsOptions: RouteOptions = {
  description:
    "Get aggregate user liquidity, grouped by collection. Useful for showing a summary of liquidity being provided (orders made).",
  tags: ["api"],
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      side: Joi.string().lowercase().valid("buy", "sell").required(),
      status: Joi.string().lowercase().valid("valid", "invalid").required(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      positions: Joi.array().items(
        Joi.object({
          set: {
            id: Joi.string(),
            schema: Joi.any(),
            metadata: Joi.any(),
            sampleImages: Joi.array().items(Joi.string().allow(null, "")),
            image: Joi.string().allow(null, ""),
            floorSellValue: Joi.number().unsafe().allow(null),
            topBuyValue: Joi.number().unsafe().allow(null),
          },
          primaryOrder: {
            value: Joi.number().unsafe().allow(null),
            expiry: Joi.number().unsafe().allow(null),
            status: Joi.string().allow(null),
          },
          totalValid: Joi.number().allow(null),
        })
      ),
    }).label("getUserPositionsResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_user_positions_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const positions = await queries.getUserPositions({
        ...params,
        ...query,
      } as queries.GetUserPositionsFilter);

      return { positions };
    } catch (error) {
      logger.error("get_user_positions_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
