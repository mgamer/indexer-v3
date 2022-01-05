import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { ownershipFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/ownerships/get-ownerships";

export const getOwnershipsOptions: RouteOptions = {
  description: "Get aggregated ownership information. Useful for exploring top owners in a collection or attribute.",
  tags: ["api"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      owner: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      attributes: Joi.object().unknown(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      ownerships: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          ownership: ownershipFormat,
        })
      ),
    }).label("getOwnershipsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_ownerships_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const ownerships = await queries.getOwnerships(
        query as queries.GetOwnershipsFilter
      );

      return { ownerships };
    } catch (error) {
      logger.error("get_ownerships_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
