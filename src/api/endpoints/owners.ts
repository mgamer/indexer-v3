import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/owners";

const getOwnersResponse = Joi.object({
  owners: Joi.array().items(
    Joi.object({
      address: Joi.string(),
      ownership: Joi.object({
        tokenCount: Joi.string(),
        onSaleCount: Joi.string(),
        floorSellValue: Joi.string().allow(null),
        topBuyValue: Joi.string().allow(null),
        totalBuyValue: Joi.string().allow(null),
        lastAcquiredAt: Joi.number().allow(null)
      })
    })
  ),
}).label("getOwnersResponse");

export const getOwnersOptions: RouteOptions = {
  description: "Get owners",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase(),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      owner: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: getOwnersResponse,
    failAction: (_request, _h, error) => {
      logger.error(
        "get_owners_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const owners = await queries.getOwners(query as queries.GetOwnersFilter);
      return { owners };
    } catch (error) {
      logger.error("get_owners_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
